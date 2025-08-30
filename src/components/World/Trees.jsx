import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { calculateHeight } from './Ground';
import { isPositionOnPath } from './Paths';

// Helper: gradient map for toon bands
function createToonGradientTexture(steps = 4) {
  const width = steps;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const v = Math.round((i / (width - 1)) * 255);
    const o = i * 4;
    data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true; return tex;
}

// Arbres stylisés (feuilles en cartes alpha + vent) pour une ambiance de grande forêt
export default function Trees({
  count = 300,
  width = 100,
  height = 100,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
  paths = [],
  sizeMultiplier = 4, // Agrandir fortement les arbres par défaut
}) {
  const trunkMeshRef = useRef(null);
  const leafMeshRef = useRef(null);

  const timeUniform = useMemo(() => ({ value: 0 }), []);
  useFrame(({ clock }) => {
    timeUniform.value = clock.getElapsedTime();
  });

  // Géométries (plus de segments pour des déformations lisses)
  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(
    /* top */ 0.22, /* bottom */ 0.30, /* height */ 1,
    /* radial */ 12, /* height */ 12, /* openEnded */ true
  ), []);
  const leafCardGeometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    // Remonter le pivot au bas de la feuille pour éviter l'effet "tombant"
    g.translate(0, 0.5, 0);
    return g;
  }, []);

  // Texture de feuilles (map + alpha)
  const leavesTexture = useTexture('/assets/textures/leaves/leaves.png');
  useEffect(() => {
    if (leavesTexture) {
      leavesTexture.wrapS = leavesTexture.wrapT = THREE.ClampToEdgeWrapping;
      leavesTexture.minFilter = THREE.LinearMipMapLinearFilter;
      leavesTexture.magFilter = THREE.LinearFilter;
      leavesTexture.anisotropy = 8;
      leavesTexture.offset.set(0, 0);
      leavesTexture.repeat.set(1, 1);
    }
  }, [leavesTexture]);

  // Gradient toon (partagé)
  const gradientMap = useMemo(() => createToonGradientTexture(4), []);

  // Matériaux
  const trunkMaterial = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: new THREE.Color('#73573b'),
        gradientMap,
        dithering: true,
      }),
    [gradientMap]
  );

  // Injecter des variations de tronc dans le shader (silhouette plus esthétique)
  useEffect(() => {
    if (!trunkMaterial) return;
    trunkMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        attribute vec4 instanceTrunkRand;   // angle, bendAmt, taperBase, twist
        attribute vec3 instanceTrunkParams; // rootFlare, noiseAmp, wobbleFreq
        attribute vec4 instanceTrunkShape;  // baseBulge, midBulge, midHeight, taperPower
        attribute float instanceVariant;     // 0: round, 1: pine, 2: umbrella
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // local position
         vec3 p = transformed;
         // y normalized in [0..1] for height profile (geometry is -0.5..+0.5)
         float yNorm = clamp(p.y + 0.5, 0.0, 1.0);

         // Silhouette profile — base flare and mid bulge
         float baseBulge = instanceTrunkShape.x;   // 0..0.6
         float midBulge  = instanceTrunkShape.y;   // 0..0.5
         float midPos    = instanceTrunkShape.z;   // 0.2..0.8
         float taperPow  = max(0.01, instanceTrunkShape.w); // 0.6..2.5

         // Base flare stronger near ground
         float baseFactor = 1.0 + baseBulge * (1.0 - smoothstep(0.0, 0.35, yNorm));

         // Mid bulge as a soft bell curve around midPos
         float width = 0.28;
         float midX = clamp(1.0 - abs(yNorm - midPos) / width, 0.0, 1.0);
         float midFactor = 1.0 + midBulge * midX * midX;

         // Global taper towards top
         float taper = pow(1.0 - yNorm, taperPow);
         float variantTaper = mix(0.75, 0.95, step(0.5, instanceVariant)); // pine slimmer
         float taperFactor = mix(1.0, variantTaper, 0.8) * (0.85 + 0.15 * taper);

         // Combine radius scale
         float radiusScale = baseFactor * midFactor * taperFactor;
         p.xz *= radiusScale;

         // Gentle directional bend
         float ang = instanceTrunkRand.x;
         vec2 dir = vec2(cos(ang), sin(ang));
         p.x += dir.x * instanceTrunkRand.y * yNorm * yNorm;
         p.z += dir.y * instanceTrunkRand.y * yNorm * yNorm;

         // Soft twist towards the top
         float twist = instanceTrunkRand.w * yNorm;
         float c = cos(twist); float s = sin(twist);
         mat2 rot = mat2(c, -s, s, c);
         p.xz = rot * p.xz;

         // Subtle wobbly noise along the height for a hand‑crafted look
         float wobble = sin((p.y + 1.5) * instanceTrunkParams.z) * instanceTrunkParams.y * (0.25 + yNorm);
         p.xz += dir * wobble;

         // Extra flare roots for umbrella (variant 2)
         if (instanceVariant > 1.5) {
           float buttress = 0.10 * (1.0 - yNorm);
           mat2 rotB = mat2(cos(ang+1.57), -sin(ang+1.57), sin(ang+1.57), cos(ang+1.57));
           vec2 pxz = rotB * p.xz;
           pxz.x *= (1.0 + buttress);
           p.xz = inverse(rotB) * pxz;
         }

         transformed = p;`
      );
    };
    trunkMaterial.needsUpdate = true;
  }, [trunkMaterial]);

  const leafMaterial = useMemo(() => {
    const mat = new THREE.MeshToonMaterial({
      color: new THREE.Color('#88c56c'),
      map: leavesTexture || null,
      alphaMap: leavesTexture || null,
      transparent: false, // préférer le cutout pour éviter le tri
      alphaTest: 0.4,     // plus opaque
      depthWrite: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -0.5,
      dithering: true,
      gradientMap,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.time = timeUniform;
      shader.vertexShader = `
        uniform float time;
        attribute vec3 instanceRandom;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float t = time * (0.6 + instanceRandom.x * 0.8);
         float sway = sin(t + position.y * 1.2 + instanceRandom.y * 6.2831) * 0.08;
         float sway2 = sin(t * 1.7 + instanceRandom.z * 10.0) * 0.04;
         float heightFactor = clamp((position.y + 0.5), 0.0, 1.5);
         float sideFactor = (abs(position.x) + abs(position.z));
         transformed.x += (sway + sway2) * (0.6 + sideFactor) * heightFactor;
         transformed.z += sway * 0.5 * (0.6 + sideFactor) * heightFactor;`
      );
    };

    return mat;
  }, [timeUniform, leavesTexture, gradientMap]);

  // Placement procédural + variantes d'arbres
  useEffect(() => {
    if (!trunkMeshRef.current || !leafMeshRef.current) return;

    const trunkMesh = trunkMeshRef.current;
    const leafMesh = leafMeshRef.current;

    const dummy = new THREE.Object3D();
    const triesMax = count * 12;
    const minDistanceBase = 1.6;
    const minDistance = minDistanceBase * Math.max(1, sizeMultiplier * 0.9);
    const pathMarginLocal = 0.8; // garder la même marge pour les chemins
    const maxSlope = 0.35;
    const accepted = [];

    const isValidPosition = (x, z) => {
      if (paths && paths.length > 0 && isPositionOnPath(x, z, paths, pathMarginLocal)) return false;
      const h = calculateHeight(x, z, frequency, amplitude);
      const hx = calculateHeight(x + 0.5, z, frequency, amplitude);
      const hz = calculateHeight(x, z + 0.5, frequency, amplitude);
      const slope = Math.max(Math.abs(hx - h), Math.abs(hz - h));
      if (slope > maxSlope) return false;
      for (const p of accepted) {
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < minDistance * minDistance) return false;
      }
      return true;
    };

    let attempts = 0;
    while (accepted.length < count && attempts < triesMax) {
      attempts++;
      const x = (Math.random() - 0.5) * width;
      const z = (Math.random() - 0.5) * height;
      if (!isValidPosition(x, z)) continue;
      const y = calculateHeight(x, z, frequency, amplitude);
      accepted.push({ x, y, z });
    }

    // Préparer per‑tree attributes and transforms
    const n = accepted.length;
    trunkMesh.count = n;

    // Per‑tree metadata for canopy generation
    const variants = new Float32Array(n); // 0 round, 1 pine, 2 umbrella
    const trunkRand = new Float32Array(n * 4);   // angle, bendAmt, taperBase, twist
    const trunkParams = new Float32Array(n * 3); // rootFlare, noiseAmp, wobbleFreq
    const trunkShape = new Float32Array(n * 4);  // baseBulge, midBulge, midHeight, taperPower

    for (let i = 0; i < n; i++) {
      const { x, y, z } = accepted[i];

      // Style variant with weights (round 45%, pine 35%, umbrella 20%)
      const r = Math.random();
      const variant = r < 0.45 ? 0.0 : (r < 0.80 ? 1.0 : 2.0);
      variants[i] = variant;

      // Trunk overall transforms
      const trunkHeight = ((variant === 1.0 ? 2.6 : variant === 2.0 ? 2.0 : 2.2) * (0.85 + Math.random() * 0.5)) * sizeMultiplier;
      const trunkRadiusScale = ((variant === 1.0 ? 0.7 : variant === 2.0 ? 1.1 : 0.9) * (0.9 + Math.random() * 0.5)) * sizeMultiplier;
      const yaw = Math.random() * Math.PI * 2;
      const dummyYPos = y + trunkHeight * 0.5;
      dummy.position.set(x, dummyYPos, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(trunkRadiusScale, trunkHeight, trunkRadiusScale);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);

      // Shader attributes — silhouette + bend
      trunkRand[i * 4 + 0] = Math.random() * Math.PI * 2;      // bend angle
      trunkRand[i * 4 + 1] = (variant === 1.0 ? 0.02 : 0.05) + Math.random() * 0.12; // bend amount
      trunkRand[i * 4 + 2] = 0.6 + Math.random() * 0.4;        // base for taper
      trunkRand[i * 4 + 3] = Math.random() * 0.6;              // twist

      trunkParams[i * 3 + 0] = 1.05 + Math.random() * 0.5;     // root flare
      trunkParams[i * 3 + 1] = Math.random() * 0.10;           // lateral noise amp
      trunkParams[i * 3 + 2] = 2.0 + Math.random() * 3.0;      // wobble freq

      // Silhouette controls by variant
      const baseBulge = (variant === 2.0 ? 0.45 : 0.25) + Math.random() * 0.15; // umbrella has stronger base
      const midBulge  = (variant === 0.0 ? 0.35 : 0.15) * (0.9 + Math.random() * 0.3);
      const midPos    = (variant === 1.0 ? 0.55 : 0.45) + (Math.random() - 0.5) * 0.1;
      const taperPow  = (variant === 1.0 ? 2.0 : 1.2) + (Math.random() - 0.5) * 0.6;
      trunkShape[i * 4 + 0] = baseBulge;
      trunkShape[i * 4 + 1] = midBulge;
      trunkShape[i * 4 + 2] = THREE.MathUtils.clamp(midPos, 0.2, 0.8);
      trunkShape[i * 4 + 3] = THREE.MathUtils.clamp(taperPow, 0.6, 2.5);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.geometry.setAttribute('instanceTrunkRand', new THREE.InstancedBufferAttribute(trunkRand, 4));
    trunkMesh.geometry.setAttribute('instanceTrunkParams', new THREE.InstancedBufferAttribute(trunkParams, 3));
    trunkMesh.geometry.setAttribute('instanceTrunkShape', new THREE.InstancedBufferAttribute(trunkShape, 4));
    trunkMesh.geometry.setAttribute('instanceVariant', new THREE.InstancedBufferAttribute(variants, 1));
    trunkMesh.castShadow = trunkMesh.receiveShadow = true;
    trunkMesh.frustumCulled = false;

    // Feuilles: distribution par variante
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    const CARDS_ROUND = 360;
    const CARDS_PINE = 420;
    const CARDS_UMBRELLA = 300;
    const MAX_CARDS_PER_TREE = Math.max(CARDS_ROUND, CARDS_PINE, CARDS_UMBRELLA);

    // Calcul du total exact pour limiter le count
    let leafCount = 0;
    for (let i = 0; i < n; i++) {
      leafCount += (variants[i] === 1.0 ? CARDS_PINE : (variants[i] === 2.0 ? CARDS_UMBRELLA : CARDS_ROUND));
    }

    if (leafMesh.count !== leafCount) {
      leafMesh.count = leafCount;
    }

    const instanceRandoms = new Float32Array(leafCount * 3);
    let k = 0;

    for (let i = 0; i < n; i++) {
      const { x, y, z } = accepted[i];
      const variant = variants[i];
      const trunkHeight = trunkMesh.instanceMatrix ? (function(){
        // Reconstituer l'échelle Y à partir de la matrice
        const m = new THREE.Matrix4(); trunkMesh.getMatrixAt(i, m);
        const sx = new THREE.Vector3(); const q = new THREE.Quaternion(); const t = new THREE.Vector3();
        m.decompose(t, q, sx); return sx.y; })() : 2.2 * sizeMultiplier;

      // Paramètres de canopée selon la variante
      let canopyHeight, canopyRadiusBase;
      if (variant === 1.0) { // conifère
        canopyHeight = trunkHeight * 0.85;
        canopyRadiusBase = (0.6 + Math.random() * 0.4) * sizeMultiplier;
      } else if (variant === 2.0) { // parasol
        canopyHeight = trunkHeight * 0.55;
        canopyRadiusBase = (1.1 + Math.random() * 0.5) * sizeMultiplier;
      } else { // ronde
        canopyHeight = trunkHeight * 0.75;
        canopyRadiusBase = (0.8 + Math.random() * 0.4) * sizeMultiplier;
      }
      const baseY = y + trunkHeight;

      if (variant === 1.0) {
        // Conifère: étages en anneaux décroissants
        const levels = 12;
        const cardsPerLevel = Math.floor(CARDS_PINE / levels);
        for (let lvl = 0; lvl < levels; lvl++) {
          const h01 = (lvl + 0.5) / levels; // 0..1
          const ringY = baseY - (1.0 - h01) * canopyHeight;
          const ringRadius = canopyRadiusBase * (1.0 - h01) * (0.9 + Math.random() * 0.1);
          for (let j = 0; j < cardsPerLevel; j++) {
            const theta = (j / cardsPerLevel) * Math.PI * 2 + lvl * 0.2;
            const localX = Math.cos(theta) * ringRadius * (0.85 + Math.random() * 0.3);
            const localZ = Math.sin(theta) * ringRadius * (0.85 + Math.random() * 0.3);
            // Inclinaison vers le bas plus légère et réduite près du sommet
            const baseTilt = -0.06 + (Math.random() - 0.5) * 0.08;
            const tiltX = baseTilt * (1.0 - h01 * 0.5);
            const tiltZ = (Math.random() - 0.5) * 0.12;
            const yaw = theta + (Math.random() - 0.5) * 0.25;
            const s = (0.35 + Math.random() * 0.35) * sizeMultiplier;
            dummy.position.set(x + localX, ringY, z + localZ);
            dummy.rotation.set(tiltX, yaw, tiltZ);
            dummy.scale.set(s, s * 0.9, 1);
            dummy.updateMatrix();
            leafMesh.setMatrixAt(k, dummy.matrix);
            instanceRandoms[k * 3] = Math.random();
            instanceRandoms[k * 3 + 1] = Math.random();
            instanceRandoms[k * 3 + 2] = Math.random();
            k++;
          }
        }
      } else if (variant === 2.0) {
        // Parasol: dense près du sommet, disque élargi
        const cards = CARDS_UMBRELLA;
        for (let j = 0; j < cards; j++) {
          const u = (j + 0.5) / cards; // 0..1
          const angle = j * GOLDEN_ANGLE;
          const r = Math.sqrt(Math.max(0.0, 1.0 - u));
          const localX = Math.cos(angle) * r * canopyRadiusBase * (0.9 + Math.random() * 0.2);
          const localZ = Math.sin(angle) * r * canopyRadiusBase * (0.9 + Math.random() * 0.2);
          const localY = (0.7 + 0.3 * u) * canopyHeight;
          // Légère préférence vers l'horizontal/haut
          const rawTilt = (Math.random() - 0.3) * 0.12;
          const tiltX = THREE.MathUtils.clamp(rawTilt, -0.06, 0.14);
          const tiltZ = (Math.random() - 0.5) * 0.12;
          const yaw = Math.atan2(localZ, localX);
          const s = (0.50 + Math.random() * 0.45) * sizeMultiplier;
          dummy.position.set(x + localX, baseY - canopyHeight + localY, z + localZ);
          dummy.rotation.set(tiltX, yaw, tiltZ);
          dummy.scale.set(s, s * (0.8 + Math.random() * 0.3), 1);
          dummy.updateMatrix();
          leafMesh.setMatrixAt(k, dummy.matrix);
          instanceRandoms[k * 3] = Math.random();
          instanceRandoms[k * 3 + 1] = Math.random();
          instanceRandoms[k * 3 + 2] = Math.random();
          k++;
        }
      } else {
        // Ronde: distribution quasi‑sphérique (hémisphère supérieure majoritaire)
        const cards = CARDS_ROUND;
        for (let j = 0; j < cards; j++) {
          const u = (j + 0.5) / cards;
          let yHemi = 1.0 - 2.0 * u; // [-1,1]
          yHemi = Math.abs(yHemi);   // [0,1] -> top hemi
          const r = Math.sqrt(Math.max(0.0, 1.0 - yHemi * yHemi));
          const theta = j * GOLDEN_ANGLE;
          const dirX = Math.cos(theta) * r;
          const dirZ = Math.sin(theta) * r;
          const jitterR = 0.85 + Math.random() * 0.35;
          const localX = dirX * canopyRadiusBase * jitterR;
          const localZ = dirZ * canopyRadiusBase * jitterR;
          const localY = yHemi * canopyHeight * (0.9 + Math.random() * 0.2);
          // Inclinaisons réduites et légèrement biaisées vers le haut
          const rawTilt = (Math.random() - 0.3) * 0.18;
          const tiltX = THREE.MathUtils.clamp(rawTilt, -0.08, 0.20);
          const tiltZ = (Math.random() - 0.5) * 0.18;
          const yaw = Math.atan2(localZ, localX) + (Math.random() - 0.5) * 0.35;
          const s = (0.45 + Math.random() * 0.55) * sizeMultiplier;
          // Relever un peu la canopée globale (moins d'affaissement)
          dummy.position.set(x + localX, baseY + localY - canopyHeight * 0.35, z + localZ);
          dummy.rotation.set(tiltX, yaw, tiltZ);
          dummy.scale.set(s, s * (0.85 + Math.random() * 0.3), 1);
          dummy.updateMatrix();
          leafMesh.setMatrixAt(k, dummy.matrix);
          instanceRandoms[k * 3] = Math.random();
          instanceRandoms[k * 3 + 1] = Math.random();
          instanceRandoms[k * 3 + 2] = Math.random();
          k++;
        }
      }
    }

    leafMesh.instanceMatrix.needsUpdate = true;
    leafMesh.geometry.setAttribute('instanceRandom', new THREE.InstancedBufferAttribute(instanceRandoms, 3));
    leafMesh.castShadow = leafMesh.receiveShadow = true;
    leafMesh.frustumCulled = false;
  }, [count, width, height, frequency, amplitude, paths, trunkMaterial, leafMaterial, sizeMultiplier]);

  return (
    <group position={position}>
      <instancedMesh ref={trunkMeshRef} args={[trunkGeometry, trunkMaterial, count]} onBeforeRender={(...args) => {}} />
      {(() => {
        const MAX_CARDS_PER_TREE = 500; // capacité max par arbre (selon variante)
        const capacity = Math.max(1, count * MAX_CARDS_PER_TREE);
        return (
          <instancedMesh ref={leafMeshRef} args={[leafCardGeometry, leafMaterial, capacity]} />
        );
      })()}
    </group>
  );
}


