import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { calculateHeight } from './Ground';
import { isPositionOnPath } from './Paths';

// Arbres stylisés (feuilles en cartes alpha + vent) pour une ambiance de grande forêt
export default function Trees({
  count = 300,
  width = 100,
  height = 100,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
  paths = [],
}) {
  const trunkMeshRef = useRef(null);
  const leafMeshRef = useRef(null);

  const timeUniform = useMemo(() => ({ value: 0 }), []);
  useFrame(({ clock }) => {
    timeUniform.value = clock.getElapsedTime();
  });

  // Géométries
  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.14, 0.26, 1, 8, 1, true), []);
  const leafCardGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

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

  // Remplacement de texture: feuille procédurale via shader (pas de dépendance image)

  // Matériaux
  const trunkMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#6e5436'),
        roughness: 0.85,
        metalness: 0.02,
      }),
    []
  );

  // Injecter des variations de tronc dans le shader
  useEffect(() => {
    if (!trunkMaterial) return;
    trunkMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        attribute vec4 instanceTrunkRand; // angle, bendAmt, taper, twist
        attribute vec3 instanceTrunkParams; // rootFlare, noiseAmp, wobbleFreq
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // p local
         vec3 p = transformed;
         float yNorm = clamp(p.y + 0.5, 0.0, 1.0);
         // Taper vers le haut
         float taper = mix(1.0, instanceTrunkRand.z, yNorm);
         p.xz *= taper;
         // Root flare (élargir base)
         float flare = mix(instanceTrunkParams.x, 1.0, yNorm);
         p.xz *= flare;
         // Courbure
         float ang = instanceTrunkRand.x;
         vec2 dir = vec2(cos(ang), sin(ang));
         p.x += dir.x * instanceTrunkRand.y * yNorm * yNorm;
         p.z += dir.y * instanceTrunkRand.y * yNorm * yNorm;
         // Torsion
         float twist = instanceTrunkRand.w * yNorm;
         float c = cos(twist);
         float s = sin(twist);
         mat2 rot = mat2(c, -s, s, c);
         p.xz = rot * p.xz;
         // Bruit latéral (vaguelette)
         float wobble = sin((p.y + 1.5) * instanceTrunkParams.z) * instanceTrunkParams.y * (0.3 + yNorm);
         p.xz += dir * wobble;
         transformed = p;`
      );
    };
    trunkMaterial.needsUpdate = true;
  }, [trunkMaterial]);

  const leafMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#88c56c'),
      map: leavesTexture || null,
      alphaMap: leavesTexture || null,
      roughness: 0.7,
      metalness: 0.02,
      transparent: false, // préférer le cutout pour éviter le tri
      alphaTest: 0.4,     // plus opaque
      depthWrite: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -0.5,
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
  }, [timeUniform, leavesTexture]);

  // Placement procédural
  useEffect(() => {
    if (!trunkMeshRef.current || !leafMeshRef.current) return;

    const trunkMesh = trunkMeshRef.current;
    const leafMesh = leafMeshRef.current;

    const dummy = new THREE.Object3D();
    const triesMax = count * 10;
    const minDistance = 1.6;
    const pathMargin = 0.8;
    const maxSlope = 0.35;
    const accepted = [];

    const isValidPosition = (x, z) => {
      if (paths && paths.length > 0 && isPositionOnPath(x, z, paths, pathMargin)) return false;
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

    // Tronc instances
    const n = accepted.length;
    trunkMesh.count = n;
    for (let i = 0; i < n; i++) {
      const { x, y, z } = accepted[i];
      const trunkHeight = 1.8 + Math.random() * 1.6;
      const trunkRadiusScale = 0.8 + Math.random() * 0.6;
      const yaw = Math.random() * Math.PI * 2;
      dummy.position.set(x, y + trunkHeight * 0.5, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(trunkRadiusScale, trunkHeight, trunkRadiusScale);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
    }
    // Attributs d'instance pour variations du tronc
    const trunkRand = new Float32Array(n * 4);   // angle, bendAmt, taper, twist
    const trunkParams = new Float32Array(n * 3); // rootFlare, noiseAmp, wobbleFreq
    for (let i = 0; i < n; i++) {
      // angle de flexion 0..2PI
      trunkRand[i * 4 + 0] = Math.random() * Math.PI * 2;
      // intensité de flexion
      trunkRand[i * 4 + 1] = 0.03 + Math.random() * 0.18;
      // facteur de rétrécissement vers le haut (0.35..0.8)
      trunkRand[i * 4 + 2] = 0.35 + Math.random() * 0.45;
      // torsion (0..0.6 rad)
      trunkRand[i * 4 + 3] = Math.random() * 0.6;

      // élargissement racinaire (0.95..1.35)
      trunkParams[i * 3 + 0] = 0.95 + Math.random() * 0.4;
      // amplitude du bruit latéral (0.0..0.12)
      trunkParams[i * 3 + 1] = Math.random() * 0.12;
      // fréquence du bruit (2.0..5.0)
      trunkParams[i * 3 + 2] = 2.0 + Math.random() * 3.0;
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.geometry.setAttribute('instanceTrunkRand', new THREE.InstancedBufferAttribute(trunkRand, 4));
    trunkMesh.geometry.setAttribute('instanceTrunkParams', new THREE.InstancedBufferAttribute(trunkParams, 3));
    trunkMesh.castShadow = trunkMesh.receiveShadow = true;
    trunkMesh.frustumCulled = false;

    // Feuilles: plusieurs cartes par arbre (distribution uniforme et compacte)
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    const LEAF_CARDS_PER_TREE = 360; // densité élevée mais maîtrisée
    const leafCount = n * LEAF_CARDS_PER_TREE;
    // Ajuster la capacité si nécessaire
    if (leafMesh.count !== leafCount) {
      leafMesh.count = leafCount;
    }

    const instanceRandoms = new Float32Array(leafCount * 3);
    let k = 0;

    for (let i = 0; i < n; i++) {
      const { x, y, z } = accepted[i];
      const trunkHeight = 1.9 + Math.random() * 1.3;
      const canopyHeight = 1.4 + Math.random() * 1.1;
      const canopyRadius = 0.6 + Math.random() * 0.5; // compact mais naturel
      const baseY = y + trunkHeight;

      for (let j = 0; j < LEAF_CARDS_PER_TREE; j++) {
        // Fibonacci sphere (uniform), restreint à l'hémisphère supérieure
        const u = (j + 0.5) / LEAF_CARDS_PER_TREE;
        let yHemi = 1 - 2 * u; // [-1,1]
        yHemi = Math.abs(yHemi); // [0,1] -> hémisphère top
        const r = Math.sqrt(Math.max(0, 1 - yHemi * yHemi));
        const theta = j * GOLDEN_ANGLE;
        const dirX = Math.cos(theta) * r;
        const dirZ = Math.sin(theta) * r;

        const jitterR = 0.8 + Math.random() * 0.4; // léger jitter radial
        const localX = dirX * canopyRadius * jitterR;
        const localZ = dirZ * canopyRadius * jitterR;
        const localY = yHemi * canopyHeight * (0.9 + Math.random() * 0.2);

        const tiltX = (Math.random() - 0.5) * 0.25;
        const tiltZ = (Math.random() - 0.5) * 0.25;
        const outwardYaw = Math.atan2(localZ, localX);
        const yaw = outwardYaw + (Math.random() - 0.5) * 0.4;

        const s = 0.45 + Math.random() * 0.55; // cartes petites et nombreuses

        dummy.position.set(x + localX, baseY + localY, z + localZ);
        dummy.rotation.set(tiltX, yaw, tiltZ);
        dummy.scale.set(s, s * (0.85 + Math.random() * 0.3), 1);
        dummy.updateMatrix();
        leafMesh.setMatrixAt(k, dummy.matrix);

        // data aléatoire pour le vent
        instanceRandoms[k * 3] = Math.random();
        instanceRandoms[k * 3 + 1] = Math.random();
        instanceRandoms[k * 3 + 2] = Math.random();
        k++;
      }
    }

    leafMesh.instanceMatrix.needsUpdate = true;
    leafMesh.geometry.setAttribute('instanceRandom', new THREE.InstancedBufferAttribute(instanceRandoms, 3));
    leafMesh.castShadow = leafMesh.receiveShadow = true;
    leafMesh.frustumCulled = false;
  }, [count, width, height, frequency, amplitude, paths, trunkMaterial, leafMaterial]);

  return (
    <group position={position}>
      <instancedMesh ref={trunkMeshRef} args={[trunkGeometry, trunkMaterial, count]} onBeforeRender={(...args) => {}} />
      {(() => {
        const LEAF_CARDS_PER_TREE = 360;
        const capacity = Math.max(1, count * LEAF_CARDS_PER_TREE);
        return (
          <instancedMesh ref={leafMeshRef} args={[leafCardGeometry, leafMaterial, capacity]} />
        );
      })()}
    </group>
  );
}


