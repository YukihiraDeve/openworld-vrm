import React, { useEffect, useMemo, useRef } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { calculateHeight } from './Ground';
import { isPositionOnPath } from './Paths';
import { globalLeafUniforms, FLUFFY_CONFIG } from './FluffyTreeShared';

function mulberry32(a) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Attributs à exclure (skinning, morphs, tangentes non nécessaires)
const EXCLUDED_ATTRS = new Set([
  'skinIndex', 'skinWeight',
  'morphTarget0', 'morphTarget1', 'morphTarget2', 'morphTarget3',
  'morphNormal0', 'morphNormal1', 'morphNormal2', 'morphNormal3',
  'tangent',
]);

function harmonizeAndMerge(geometries) {
  if (geometries.length === 0) return null;

  // Supprimer les attributs problématiques de chaque géométrie
  for (const geo of geometries) {
    for (const name of Object.keys(geo.attributes)) {
      if (EXCLUDED_ATTRS.has(name)) {
        geo.deleteAttribute(name);
      }
    }
  }

  if (geometries.length === 1) return geometries[0];

  // Collecter tous les noms d'attributs restants
  const allAttrNames = new Set();
  for (const geo of geometries) {
    for (const name of Object.keys(geo.attributes)) {
      allAttrNames.add(name);
    }
  }

  // Harmoniser : ajouter les attributs manquants avec le bon type de tableau
  for (const geo of geometries) {
    const vertexCount = geo.attributes.position.count;
    for (const attrName of allAttrNames) {
      if (!geo.attributes[attrName]) {
        const ref = geometries.find((g) => g.attributes[attrName]);
        const refAttr = ref.attributes[attrName];
        const itemSize = refAttr.itemSize;
        const ArrayType = refAttr.array.constructor;
        const arr = new ArrayType(vertexCount * itemSize);
        geo.setAttribute(attrName, new THREE.BufferAttribute(arr, itemSize, refAttr.normalized));
      }
    }
  }

  const result = mergeGeometries(geometries);
  if (!result) {
    console.warn('StylizedTrees: mergeGeometries échoué, fallback sur geo[0]');
    return geometries[0];
  }
  return result;
}

// ─── Shader : Vertex ───────────────────────────────────────────────
// Vent IDENTIQUE à Grass.jsx / FluffyTrees.jsx : simplex noise + déplacement directionnel
const treeVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWindStrength;
  uniform float uWindFrequency;
  uniform float uWindSpeed;

  varying vec3 vWorldPos;
  varying vec2 vLeafMask;
  varying vec2 vTexUv;

  attribute vec2 uv1;

  // Simplex Noise — identique à Grass.jsx et FluffyTreeShared.js
  ${FLUFFY_CONFIG.noiseFunctions}

  void main() {
    csm_Position = position;

    if (uv1.y >= 0.5) {
      // Position monde de l'instance (centre de l'arbre)
      #ifdef USE_INSTANCING
        vec3 instancePos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 vertexWorldPos = (instanceMatrix * vec4(position, 1.0)).xyz;
      #else
        vec3 instancePos = vec3(0.0);
        vec3 vertexWorldPos = position;
      #endif

      // Temps synchronisé — Grass: time * 0.5, ici uWindSpeed = 0.5
      float time = uTime * uWindSpeed;

      // Vent global — EXACTEMENT comme Grass.jsx:
      // snoise(vec2(pos.x * 0.1 + time * 0.5, pos.z * 0.1 + time * 0.5))
      float noiseVal = snoise(vec2(
        instancePos.x * uWindFrequency + time,
        instancePos.z * uWindFrequency + time
      ));
      float globalWind = noiseVal * 0.5 + 0.5;

      // Turbulence locale (frémissement des feuilles)
      float localTurbulence = snoise(vec2(
        vertexWorldPos.x * 0.5 + time * 2.0,
        vertexWorldPos.z * 0.5 + time * 2.0
      ));

      // Direction du vent : axe Z (matche la rotation X de l'herbe)
      vec3 windDirection = vec3(0.0, 0.0, 1.0);

      // Facteur de hauteur (plus haut = plus de mouvement)
      float heightFactor = pow(max(0.0, position.y) / 10.0, 1.5);

      // Déplacement principal synchronisé avec l'herbe
      vec3 displacement = windDirection * globalWind * uWindStrength * 3.0 * heightFactor;
      displacement += windDirection * localTurbulence * 0.1 * heightFactor;
      displacement.y += localTurbulence * 0.1 * heightFactor;

      csm_Position = position + displacement;
    }

    vLeafMask = uv1;
    vTexUv = uv;

    #ifdef USE_INSTANCING
      vWorldPos = (modelMatrix * instanceMatrix * vec4(csm_Position, 1.0)).xyz;
    #else
      vWorldPos = (modelMatrix * vec4(csm_Position, 1.0)).xyz;
    #endif
  }
`;

// ─── Shader : Fragment ─────────────────────────────────────────────
const treeFragmentShader = /* glsl */ `
  uniform sampler2D uAlphaMap;
  uniform float uAlphaTest;
  uniform sampler2D uNoiseTexture;
  uniform sampler2D uGlowTexture;

  uniform float uFresnelPower;
  uniform float uFresnelStrength;
  uniform vec3 uFresnelColor;

  uniform vec3 uLightDirection;
  uniform vec3 uLeafColor;
  uniform vec3 uSSSColor;
  uniform float uSSSStrength;
  uniform vec3 uTrunkColor;

  varying vec3 vWorldPos;
  varying vec2 vLeafMask;
  varying vec2 vTexUv;

  void main() {
    float isLeaf = step(0.5, vLeafMask.y);

    // ── Alpha cutout (feuilles uniquement) ──
    if (isLeaf > 0.5) {
      float alpha = texture2D(uAlphaMap, vTexUv).r;
      if (alpha < uAlphaTest) {
        discard;
      }
    }

    vec3 N = normalize(vNormal);
    N = gl_FrontFacing ? N : -N;
    vec3 L = normalize(uLightDirection);
    float NdotL = dot(N, L);

    vec3 color;

    if (isLeaf > 0.5) {
      // ── Couleur de base des feuilles ──
      color = uLeafColor;

      // Variation organique via noise
      float noise = texture2D(uNoiseTexture, vWorldPos.xz * 0.12).r;
      color *= 0.82 + noise * 0.36;

      // Fresnel rim light
      vec3 V = normalize(vViewPosition);
      float ndv = clamp(dot(N, V), 0.0, 1.0);
      float fresnel = pow(1.0 - ndv, uFresnelPower) * uFresnelStrength;
      color = mix(color, uFresnelColor, clamp(fresnel, 0.0, 1.0));

      // Subsurface scattering (lueur quand rétro-éclairé)
      float sssRaw = max(0.0, -NdotL + 0.2);
      float sss = pow(sssRaw, 1.5) * uSSSStrength;
      float glowVal = texture2D(uGlowTexture, vec2(clamp(sss * 2.0, 0.0, 1.0), 0.5)).r;
      color += uSSSColor * glowVal * sss;

      // Variation de couleur par instance
      #ifdef USE_INSTANCING_COLOR
        color *= vColor;
      #endif
    } else {
      // ── Tronc ──
      color = uTrunkColor;

      // Dégradé vertical du tronc (bouleau : clair en bas, légèrement plus sombre en haut)
      float trunkGrad = smoothstep(0.25, 0.75, vTexUv.y);
      color = mix(color * 1.1, color * 0.75, trunkGrad);

      // Détail d'écorce via noise
      float bark = texture2D(uNoiseTexture, vWorldPos.xy * 0.3 + vWorldPos.z * 0.1).r;
      color *= 0.82 + bark * 0.36;
    }

    csm_DiffuseColor = vec4(color, 1.0);
  }
`;

// ─── Uniforms ──────────────────────────────────────────────────────
// uTime, uWindStrength, uWindFrequency, uWindSpeed sont partagés avec
// globalLeafUniforms (FluffyTreeShared.js) pour la synchronisation.
const treeUniforms = {
  uTime: globalLeafUniforms.uTime,
  uWindStrength: globalLeafUniforms.uWindStrength,
  uWindFrequency: globalLeafUniforms.uWindFrequency,
  uWindSpeed: globalLeafUniforms.uWindSpeed,

  uAlphaTest: { value: 0.35 },

  uFresnelPower: { value: 2.5 },
  uFresnelStrength: { value: 0.45 },
  uFresnelColor: { value: new THREE.Color('#d4e8a0') },

  uLightDirection: globalLeafUniforms.uLightDirection,
  uLeafColor: { value: new THREE.Color('#8cbf45') },
  uSSSColor: { value: new THREE.Color('#ffe066') },
  uSSSStrength: { value: 0.4 },

  uTrunkColor: { value: new THREE.Color('#d9cdb8') },
};

// ─── Composant ─────────────────────────────────────────────────────
export default function StylizedTrees({
  count = 20,
  width = 100,
  height = 100,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
  paths = [],
  scale = 1.0,
  seed = 137,
}) {
  const { scene } = useGLTF('/assets/models/Trees/tree.glb');

  const [noiseTexture, glowTexture, alphaLeavesTexture] = useTexture([
    '/assets/models/textures/noiseTexture.png',
    '/assets/models/textures/glow.png',
    '/assets/models/textures/alpha_leaves.png',
  ]);

  useMemo(() => {
    noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
    glowTexture.wrapS = glowTexture.wrapT = THREE.ClampToEdgeWrapping;
    alphaLeavesTexture.wrapS = alphaLeavesTexture.wrapT = THREE.RepeatWrapping;
  }, [noiseTexture, glowTexture, alphaLeavesTexture]);

  // ── Fusion de toutes les géométries en une seule ──
  const mergedGeometry = useMemo(() => {
    const geos = [];
    scene.updateMatrixWorld(true);

    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const geo = obj.geometry.clone();
      geo.applyMatrix4(obj.matrixWorld);
      console.log(
        `StylizedTrees mesh: "${obj.name}"`,
        '| attrs:', Object.keys(geo.attributes).join(', ')
      );
      geos.push(geo);
    });

    if (geos.length === 0) return null;
    return harmonizeAndMerge(geos);
  }, [scene]);

  // ── Matériau CSM unique (feuilles + tronc via uv1 mask) ──
  const material = useMemo(() => {
    if (!mergedGeometry) return null;

    return new CustomShaderMaterial({
      baseMaterial: THREE.MeshPhongMaterial,
      vertexShader: treeVertexShader,
      fragmentShader: treeFragmentShader,
      uniforms: {
        ...treeUniforms,
        uNoiseTexture: { value: noiseTexture },
        uGlowTexture: { value: glowTexture },
        uAlphaMap: { value: alphaLeavesTexture },
      },
      side: THREE.DoubleSide,
      color: 0xffffff,
      shininess: 8,
      specular: 0x222222,
    });
  }, [mergedGeometry, noiseTexture, glowTexture, alphaLeavesTexture]);

  const meshRef = useRef();

  // ── Placement procédural des instances ──
  useEffect(() => {
    if (!meshRef.current) return;

    const rng = mulberry32(seed);
    const minDist = 5.0;
    const pathMargin = 2.5;
    const maxSlope = 0.35;
    const triesMax = count * 20;
    const accepted = [];

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const palette = [
      new THREE.Color('#7ab33e'),
      new THREE.Color('#96c44a'),
      new THREE.Color('#a8c85a'),
      new THREE.Color('#b5c96a'),
    ];

    const isValid = (x, z) => {
      if (paths?.length > 0 && isPositionOnPath(x, z, paths, pathMargin))
        return false;
      const h = calculateHeight(x, z, frequency, amplitude);
      const hx = calculateHeight(x + 1.0, z, frequency, amplitude);
      const hz = calculateHeight(x, z + 1.0, frequency, amplitude);
      if (Math.max(Math.abs(hx - h), Math.abs(hz - h)) > maxSlope)
        return false;
      for (const p of accepted) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < minDist ** 2) return false;
      }
      return true;
    };

    let idx = 0;
    let attempts = 0;
    while (idx < count && attempts < triesMax) {
      attempts++;
      const x = (rng() - 0.5) * width;
      const z = (rng() - 0.5) * height;
      if (!isValid(x, z)) continue;

      const y = calculateHeight(x, z, frequency, amplitude);
      const s = scale * (0.8 + rng() * 0.6);
      const r = rng() * Math.PI * 2;

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, r, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();

      meshRef.current.setMatrixAt(idx, dummy.matrix);
      const col = palette[Math.floor(rng() * palette.length)];
      color.copy(col);
      meshRef.current.setColorAt(idx, color);

      accepted.push({ x, z });
      idx++;
    }

    meshRef.current.count = idx;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true;

    console.log(`StylizedTrees: ${idx} arbres placés.`);
  }, [count, width, height, frequency, amplitude, paths, scale, seed]);

  // uTime est partagé via globalLeafUniforms, mis à jour par FluffyTrees.
  // Fallback : si FluffyTrees n'est pas monté, on met quand même à jour.
  useFrame((state) => {
    globalLeafUniforms.uTime.value = state.clock.elapsedTime;
  });

  if (!mergedGeometry || !material) return null;

  return (
    <group position={position}>
      <instancedMesh
        ref={meshRef}
        args={[mergedGeometry, material, count]}
        castShadow
        receiveShadow
        frustumCulled
      />
    </group>
  );
}
