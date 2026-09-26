import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { calculateHeight } from './terrain';
import { getPathMask, pathEdgeValue } from './pathMask';
import { getExclusionDensity } from './worldConfig';
import { sampleNoise } from './noise';
import { GRASS_COLORS, MAX_INTERACTIVE_PLAYERS, sharedUniforms } from './environment';
import { lightsBeginWithSunCapture, normalBeginWithoutFlip } from './shaderUtils';

const CHUNK_SIZE = 16;
const BLADE_HALF_WIDTH = 0.034;
const FADE_START = 46;
const FADE_END = 60;
const LOD_START = 16;
const LOD_END = 44;
const LOD_MIN_KEEP = 0.32;

// Brin effilé : 4 segments + pointe. x = demi-largeur, y = hauteur normalisée (0..1)
function createBladeGeometry() {
  const segments = 4;
  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const halfWidth = BLADE_HALF_WIDTH * (1 - 0.9 * Math.pow(t, 1.3));
    positions.push(-halfWidth, t, 0, halfWidth, t, 0);
    normals.push(0, 0, 1, 0, 0, 1);
  }
  positions.push(0, 1, 0);
  normals.push(0, 0, 1);

  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  indices.push(last, last + 1, segments * 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

const BLADE_GEOMETRY = createBladeGeometry();

const keepFraction = (distance) => {
  const t = THREE.MathUtils.smoothstep(distance, LOD_START, LOD_END);
  return THREE.MathUtils.lerp(1, LOD_MIN_KEEP, t);
};

const VERTEX_HEADER = /* glsl */ `
  #define GRASS_MAX_PLAYERS ${MAX_INTERACTIVE_PLAYERS}
  uniform float uTime;
  uniform vec2 uWindDirection;
  uniform float uWindStrength;
  uniform sampler2D uNoiseTexture;
  uniform vec3 uPlayers[GRASS_MAX_PLAYERS];
  uniform int uPlayerCount;
  uniform vec3 uColorBase;
  uniform vec3 uColorLush;
  uniform vec3 uColorDeep;
  uniform vec3 uColorDry;
  uniform vec3 uColorEdge;

  attribute vec4 aBlade;
  attribute vec4 aBladeData;
  attribute vec2 aBladeTint;

  varying vec3 vGrassColor;
  varying vec3 vGrassWorld;
  varying float vGrassT;
`;

const VERTEX_MAIN = /* glsl */ `
  vec3 root = aBlade.xyz;
  float bladeHeight = aBlade.w;
  float angle = aBladeData.x;
  float seed = aBladeData.y;
  float rank = aBladeData.z;
  float edge = aBladeData.w;
  float t = position.y;

  float camDist = distance(root.xz, cameraPosition.xz);
  float keep = mix(1.0, ${LOD_MIN_KEEP.toFixed(3)}, smoothstep(${LOD_START.toFixed(1)}, ${LOD_END.toFixed(1)}, camDist));
  float lodScale = 1.0 - smoothstep(keep - 0.06, keep, rank);
  float distanceFade = 1.0 - smoothstep(${FADE_START.toFixed(1)}, ${FADE_END.toFixed(1)}, camDist);
  float h = bladeHeight * lodScale * distanceFade;
  float widthScale = inversesqrt(keep) * mix(1.0, 1.6, smoothstep(20.0, ${FADE_END.toFixed(1)}, camDist));

  vec2 facing = vec2(cos(angle), sin(angle));
  vec2 across = vec2(-facing.y, facing.x);

  vec2 gustUv = root.xz * 0.017 - uWindDirection * uTime * 0.085;
  float gust = smoothstep(0.3, 0.85, texture2D(uNoiseTexture, gustUv).r);
  float ripple = texture2D(uNoiseTexture, root.xz * 0.085 - uWindDirection * uTime * 0.32).b;
  float wind = (0.18 + gust * 0.8 + ripple * 0.22) * uWindStrength;
  float flutter = sin(uTime * (2.4 + seed * 1.8) + seed * 37.0 + root.x * 0.6) * (0.05 + gust * 0.07);

  vec2 bend = uWindDirection * wind * 0.55 + facing * (0.1 + seed * 0.2) + across * flutter;

  for (int i = 0; i < GRASS_MAX_PLAYERS; i++) {
    if (i >= uPlayerCount) break;
    vec3 player = uPlayers[i];
    vec2 delta = root.xz - player.xz;
    float d2 = dot(delta, delta);
    if (d2 > 1.69) continue;
    float d = sqrt(d2);
    float push = 1.0 - d / 1.3;
    push *= push * 2.4 * (1.0 - smoothstep(1.2, 2.4, abs(player.y - root.y)));
    bend += (delta / max(d, 0.001)) * push;
  }

  float bendAmount = length(bend);
  if (bendAmount > 1.35) {
    bend *= 1.35 / bendAmount;
    bendAmount = 1.35;
  }

  vec3 transformed = root;
  transformed.xz += bend * (t * t) * h;
  transformed.y += t * h * (1.0 - 0.32 * bendAmount * t);
  transformed.xz += across * position.x * widthScale;

  vec3 tip = mix(uColorLush, uColorDeep, aBladeTint.y * 0.6);
  tip = mix(tip, uColorDry, aBladeTint.x * 0.85);
  tip = mix(tip, uColorEdge, edge * 0.65);
  tip *= 0.86 + seed * 0.28;
  vGrassColor = mix(uColorBase, tip, pow(t, 0.75));
  vGrassT = t;
  vGrassWorld = transformed;
`;

const NORMAL_MAIN = /* glsl */ `
  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
  {
    float nAngle = aBladeData.x;
    vec2 nFacing = vec2(cos(nAngle), sin(nAngle));
    vec2 nAcross = vec2(-nFacing.y, nFacing.x);
    float side = position.x >= 0.0 ? 1.0 : -1.0;
    objectNormal = normalize(vec3(nAcross.x * side * 0.35, 1.0, nAcross.y * side * 0.35));
  }
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3(tangent.xyz);
  #endif
`;

function createGrassMaterial() {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });

  const uniforms = {
    uTime: sharedUniforms.uTime,
    uWindDirection: sharedUniforms.uWindDirection,
    uWindStrength: sharedUniforms.uWindStrength,
    uNoiseTexture: sharedUniforms.uNoiseTexture,
    uSunDirection: sharedUniforms.uSunDirection,
    uPlayers: sharedUniforms.uPlayers,
    uPlayerCount: sharedUniforms.uPlayerCount,
    uColorBase: { value: new THREE.Color(GRASS_COLORS.base) },
    uColorLush: { value: new THREE.Color(GRASS_COLORS.lush) },
    uColorDeep: { value: new THREE.Color(GRASS_COLORS.deep) },
    uColorDry: { value: new THREE.Color(GRASS_COLORS.dry) },
    uColorEdge: { value: new THREE.Color(GRASS_COLORS.pathEdge) },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = VERTEX_HEADER + shader.vertexShader
      .replace('#include <beginnormal_vertex>', NORMAL_MAIN)
      .replace('#include <begin_vertex>', VERTEX_MAIN);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDirection;
        varying vec3 vGrassColor;
        varying vec3 vGrassWorld;
        varying float vGrassT;`,
      )
      .replace('#include <color_fragment>', 'diffuseColor.rgb = vGrassColor;')
      .replace('#include <normal_fragment_begin>', normalBeginWithoutFlip())
      .replace('#include <lights_fragment_begin>', lightsBeginWithSunCapture())
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        float grassOcclusion = mix(0.32, 1.0, smoothstep(0.0, 0.85, vGrassT));
        reflectedLight.indirectDiffuse *= grassOcclusion;
        reflectedLight.directDiffuse *= mix(0.55, 1.0, vGrassT);
        vec3 grassViewDir = normalize(vGrassWorld - cameraPosition);
        float backLight = pow(saturate(dot(grassViewDir, uSunDirection)), 3.0);
        totalEmissiveRadiance += capturedSunLight * vGrassColor * (backLight * 0.55 + 0.06) * vGrassT;`,
      );
  };

  material.customProgramCacheKey = () => 'stylized-grass-v2';
  return material;
}

function generateChunkInstances({ chunkX, chunkZ, count, pathMask, exclusionZones }) {
  const blades = new Float32Array(count * 4);
  const data = new Float32Array(count * 4);
  const tints = new Float32Array(count * 2);
  let valid = 0;
  let attempts = 0;
  const maxAttempts = count * 3;

  return {
    step(budgetMs) {
      const start = performance.now();
      while (valid < count && attempts < maxAttempts) {
        if ((attempts & 63) === 0 && performance.now() - start > budgetMs) return false;
        attempts++;

        const x = chunkX + (Math.random() - 0.5) * CHUNK_SIZE;
        const z = chunkZ + (Math.random() - 0.5) * CHUNK_SIZE;

        let transition = THREE.MathUtils.smoothstep(pathEdgeValue(pathMask, x, z), 0.4, 0.82);
        if (transition <= 0) continue;
        transition = Math.min(transition, getExclusionDensity(x, z, exclusionZones));
        if (Math.random() > transition * 1.15) continue;

        const patchLarge = sampleNoise(x * 0.0125, z * 0.0125, 0);
        const patchMid = sampleNoise(x * 0.045 + 0.31, z * 0.045 + 0.31, 1);
        const dryness = THREE.MathUtils.smoothstep(patchLarge * 0.72 + patchMid * 0.38, 0.6, 0.86);
        const deepness = 1 - THREE.MathUtils.smoothstep(patchMid, 0.25, 0.5);
        const lushness = 1 - THREE.MathUtils.smoothstep(patchMid, 0.25, 0.55);

        const edge = 1 - transition;
        const height =
          (0.36 + Math.random() * 0.32) *
          (1 + lushness * 0.35 - dryness * 0.25) *
          (0.45 + 0.55 * transition);

        const o = valid * 4;
        blades[o] = x;
        blades[o + 1] = calculateHeight(x, z);
        blades[o + 2] = z;
        blades[o + 3] = height;

        data[o] = Math.random() * Math.PI * 2;
        data[o + 1] = Math.random();
        data[o + 2] = 0;
        data[o + 3] = edge;
        tints[valid * 2] = dryness;
        tints[valid * 2 + 1] = deepness;
        valid++;
      }

      for (let i = 0; i < valid; i++) data[i * 4 + 2] = (i + 0.5) / valid;
      return true;
    },
    result() {
      return {
        blades: blades.slice(0, valid * 4),
        data: data.slice(0, valid * 4),
        tints: tints.slice(0, valid * 2),
        count: valid,
      };
    },
  };
}

const GrassChunk = memo(function GrassChunk({
  chunk,
  pathMask,
  exclusionZones,
  material,
  onReady,
}) {
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const generator = generateChunkInstances({
      chunkX: chunk.x,
      chunkZ: chunk.z,
      count: chunk.density,
      pathMask,
      exclusionZones,
    });

    const run = () => {
      if (cancelled) return;
      if (!generator.step(6)) {
        timer = window.setTimeout(run, 0);
        return;
      }
      const { blades, data, tints, count } = generator.result();
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = BLADE_GEOMETRY.index;
      geo.setAttribute('position', BLADE_GEOMETRY.attributes.position);
      geo.setAttribute('normal', BLADE_GEOMETRY.attributes.normal);
      geo.setAttribute('aBlade', new THREE.InstancedBufferAttribute(blades, 4));
      geo.setAttribute('aBladeData', new THREE.InstancedBufferAttribute(data, 4));
      geo.setAttribute('aBladeTint', new THREE.InstancedBufferAttribute(tints, 2));
      geo.instanceCount = count;
      geo.userData.totalInstances = count;
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(chunk.x, calculateHeight(chunk.x, chunk.z), chunk.z),
        CHUNK_SIZE * 0.75 + 2,
      );
      geo.boundingBox = new THREE.Box3(
        new THREE.Vector3(chunk.x - CHUNK_SIZE / 2 - 1, -3, chunk.z - CHUNK_SIZE / 2 - 1),
        new THREE.Vector3(chunk.x + CHUNK_SIZE / 2 + 1, 4, chunk.z + CHUNK_SIZE / 2 + 1),
      );
      setGeometry(geo);
    };

    timer = window.setTimeout(run, chunk.delay);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [chunk, pathMask, exclusionZones]);

  useEffect(() => {
    if (!geometry) return undefined;
    onReady(chunk.id, geometry);
    return () => {
      onReady(chunk.id, null);
      geometry.dispose();
    };
  }, [geometry, chunk.id, onReady]);

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} receiveShadow />;
});

const Grass = memo(function Grass({
  maxDensity = 500000,
  width = 112,
  height = 112,
  paths = [],
  exclusionZones = [],
}) {
  const pathMask = useMemo(() => getPathMask(paths), [paths]);
  const material = useMemo(() => createGrassMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  const chunks = useMemo(() => {
    const cols = Math.ceil(width / CHUNK_SIZE);
    const rows = Math.ceil(height / CHUNK_SIZE);
    const densityPerChunk = Math.floor(maxDensity / (cols * rows));
    const list = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = -width / 2 + CHUNK_SIZE / 2 + c * CHUNK_SIZE;
        const z = -height / 2 + CHUNK_SIZE / 2 + r * CHUNK_SIZE;
        list.push({ id: `grass-${c}-${r}`, x, z, density: densityPerChunk, distance: Math.hypot(x, z) });
      }
    }
    list.sort((a, b) => a.distance - b.distance);
    list.forEach((chunk, index) => {
      chunk.delay = index * 8;
    });
    return list;
  }, [width, height, maxDensity]);

  const readyGeometries = useRef(new Map());
  const onReady = useMemo(
    () => (id, geometry) => {
      if (geometry) {
        const chunk = chunks.find((item) => item.id === id);
        readyGeometries.current.set(id, { geometry, chunk });
      } else {
        readyGeometries.current.delete(id);
      }
    },
    [chunks],
  );

  useFrame(({ camera }) => {
    const half = CHUNK_SIZE / 2;
    readyGeometries.current.forEach(({ geometry, chunk }) => {
      const dx = Math.max(Math.abs(camera.position.x - chunk.x) - half, 0);
      const dz = Math.max(Math.abs(camera.position.z - chunk.z) - half, 0);
      const nearest = Math.hypot(dx, dz);
      const total = geometry.userData.totalInstances;
      geometry.instanceCount = nearest > FADE_END
        ? 0
        : Math.min(total, Math.ceil(total * (keepFraction(nearest) + 0.02)));
    });
  });

  return (
    <group>
      {chunks.map((chunk) => (
        <GrassChunk
          key={chunk.id}
          chunk={chunk}
          pathMask={pathMask}
          exclusionZones={exclusionZones}
          material={material}
          onReady={onReady}
        />
      ))}
    </group>
  );
});

export default Grass;
