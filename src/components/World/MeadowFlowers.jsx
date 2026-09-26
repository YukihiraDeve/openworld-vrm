import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { calculateHeight } from './terrain';
import { getPathMask, pathEdgeValue } from './pathMask';
import { getExclusionDensity, WORLD_EXCLUSION_ZONES } from './worldConfig';
import { createRandom, sampleNoise } from './noise';
import { flowerPatchValue } from './vegetationLayout';
import { MAX_INTERACTIVE_PLAYERS, SUN_DIRECTION, sharedUniforms } from './environment';
import { lightsBeginWithSunCapture, normalBeginWithoutFlip } from './shaderUtils';

const AREA = 108;
const FADE_START = 32;
const FADE_END = 44;
const STEM_SEGMENTS = 3;
const STEM_WIDTH = 0.016;
const ATLAS_CELL = 128;

// Espèces : marguerite, bouton d'or, bleuet, coquelicot
const SPECIES = [
  { stem: [0.58, 0.84], head: [0.14, 0.18] },
  { stem: [0.6, 0.86], head: [0.11, 0.14] },
  { stem: [0.66, 0.92], head: [0.12, 0.16] },
  { stem: [0.7, 0.98], head: [0.16, 0.2] },
];

function drawPetals(ctx, { count, inner, length, width, base, tip, rotation = 0 }) {
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.rotate(rotation + (i / count) * Math.PI * 2);
    const gradient = ctx.createLinearGradient(inner, 0, inner + length, 0);
    gradient.addColorStop(0, base);
    gradient.addColorStop(1, tip);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(inner + length / 2, 0, length / 2, width / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawHeart(ctx, radius, inner, outer, dots, random) {
  const gradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  if (!dots) return;
  ctx.fillStyle = dots;
  for (let i = 0; i < 18; i++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius * 0.85;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCornflowerPetal(ctx, inner, length, width) {
  const teeth = 4;
  ctx.beginPath();
  ctx.moveTo(inner, -width * 0.12);
  ctx.lineTo(inner + length * 0.78, -width / 2);
  for (let i = 0; i <= teeth; i++) {
    const y = -width / 2 + (i / teeth) * width;
    const x = inner + length * (i % 2 === 0 ? 1 : 0.86);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(inner + length * 0.78, width / 2);
  ctx.lineTo(inner, width * 0.12);
  ctx.closePath();
  ctx.fill();
}

function createFlowerAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_CELL * SPECIES.length;
  canvas.height = ATLAS_CELL;
  const ctx = canvas.getContext('2d');
  const random = createRandom(4242);
  const center = ATLAS_CELL / 2;

  const cell = (index, draw) => {
    ctx.save();
    ctx.translate(index * ATLAS_CELL + center, center);
    draw();
    ctx.restore();
  };

  cell(0, () => {
    drawPetals(ctx, { count: 14, inner: 8, length: 50, width: 13, base: '#e6ded6', tip: '#ffffff' });
    drawPetals(ctx, {
      count: 14, inner: 8, length: 44, width: 11, base: '#eee8e2', tip: '#fffefa', rotation: Math.PI / 14,
    });
    drawHeart(ctx, 15, '#ffe066', '#e89a10', '#c9780a', random);
  });

  cell(1, () => {
    drawPetals(ctx, { count: 5, inner: 2, length: 50, width: 42, base: '#e9a800', tip: '#ffe45c' });
    drawHeart(ctx, 11, '#d8e06a', '#a7a51c', '#fff4a8', random);
  });

  cell(2, () => {
    for (let i = 0; i < 9; i++) {
      ctx.save();
      ctx.rotate((i / 9) * Math.PI * 2);
      const gradient = ctx.createLinearGradient(8, 0, 58, 0);
      gradient.addColorStop(0, '#2c2fa0');
      gradient.addColorStop(1, '#6b8dff');
      ctx.fillStyle = gradient;
      drawCornflowerPetal(ctx, 8, 52, 26);
      ctx.restore();
    }
    drawHeart(ctx, 12, '#6a3fa8', '#2a1452', '#9a7ad6', random);
  });

  cell(3, () => {
    drawPetals(ctx, { count: 4, inner: -2, length: 60, width: 60, base: '#a50f0b', tip: '#f2452c' });
    drawPetals(ctx, {
      count: 4, inner: -2, length: 52, width: 50, base: '#b8150e', tip: '#ff5a3a', rotation: Math.PI / 4,
    });
    drawHeart(ctx, 13, '#2a2320', '#0d0a09', '#3a3a2a', random);
    drawHeart(ctx, 6, '#8fa35a', '#4f6b2a', null, random);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// Tige (deux quads croisés) + corolle horizontale
function createFlowerGeometry() {
  const positions = [];
  const uvs = [];
  const parts = [];
  const indices = [];

  const addStemQuad = (axisX, axisZ) => {
    const start = positions.length / 3;
    for (let i = 0; i <= STEM_SEGMENTS; i++) {
      const t = i / STEM_SEGMENTS;
      positions.push(-0.5 * axisX, t, -0.5 * axisZ, 0.5 * axisX, t, 0.5 * axisZ);
      uvs.push(0, t, 1, t);
      parts.push(0, 0);
    }
    for (let i = 0; i < STEM_SEGMENTS; i++) {
      const a = start + i * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  };
  addStemQuad(1, 0);
  addStemQuad(0, 1);

  const head = positions.length / 3;
  positions.push(-0.5, 1, -0.5, 0.5, 1, -0.5, 0.5, 1, 0.5, -0.5, 1, 0.5);
  uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
  parts.push(1, 1, 1, 1);
  indices.push(head, head + 2, head + 1, head, head + 3, head + 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(positions.length).fill(0), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.setIndex(indices);
  return geometry;
}

function generateFlowers(paths, count) {
  const mask = getPathMask(paths);
  const random = createRandom(0xf10e5);
  const flowers = new Float32Array(count * 4);
  const data = new Float32Array(count * 4);
  let valid = 0;

  for (let attempt = 0; attempt < count * 12 && valid < count; attempt++) {
    const x = (random() - 0.5) * AREA;
    const z = (random() - 0.5) * AREA;

    const density = THREE.MathUtils.smoothstep(flowerPatchValue(x, z), 0.56, 0.78) * 0.9 + 0.035;
    if (random() > density) continue;

    const clearance = THREE.MathUtils.smoothstep(pathEdgeValue(mask, x, z), 0.55, 0.9);
    if (random() > clearance * getExclusionDensity(x, z, WORLD_EXCLUSION_ZONES)) continue;

    const region = sampleNoise(x * 0.01 + 0.52, z * 0.01 + 0.18, 1);
    let type = region < 0.34 ? 0 : region < 0.52 ? 1 : region < 0.74 ? 2 : 3;
    if (random() < 0.12) type = Math.floor(random() * SPECIES.length);
    const species = SPECIES[type];

    const o = valid * 4;
    flowers[o] = x;
    flowers[o + 1] = calculateHeight(x, z);
    flowers[o + 2] = z;
    flowers[o + 3] = THREE.MathUtils.lerp(species.stem[0], species.stem[1], random());
    data[o] = random() * Math.PI * 2;
    data[o + 1] = type;
    data[o + 2] = THREE.MathUtils.lerp(species.head[0], species.head[1], random());
    data[o + 3] = random();
    valid++;
  }

  return { flowers: flowers.slice(0, valid * 4), data: data.slice(0, valid * 4), count: valid };
}

const VERTEX_HEADER = /* glsl */ `
  #define FLOWER_MAX_PLAYERS ${MAX_INTERACTIVE_PLAYERS}
  uniform float uTime;
  uniform vec2 uWindDirection;
  uniform float uWindStrength;
  uniform sampler2D uNoiseTexture;
  uniform vec3 uPlayers[FLOWER_MAX_PLAYERS];
  uniform int uPlayerCount;
  uniform vec2 uSunFlat;

  attribute float aPart;
  attribute vec4 aFlower;
  attribute vec4 aFlowerData;

  varying vec2 vFlowerUv;
  varying float vFlowerPart;
  varying float vFlowerT;
  varying float vFlowerSeed;
  varying vec3 vFlowerWorld;
`;

const NORMAL_MAIN = /* glsl */ `
  vec3 flowerRoot = aFlower.xyz;
  float flowerAngle = aFlowerData.x;
  float flowerSeed = aFlowerData.w;
  float flowerFade = 1.0 - smoothstep(${FADE_START.toFixed(1)}, ${FADE_END.toFixed(1)}, distance(flowerRoot.xz, cameraPosition.xz));
  float flowerHeight = aFlower.w * flowerFade;

  vec2 flowerFacing = vec2(cos(flowerAngle), sin(flowerAngle));
  vec2 flowerAcross = vec2(-flowerFacing.y, flowerFacing.x);

  vec2 flowerGustUv = flowerRoot.xz * 0.017 - uWindDirection * uTime * 0.085;
  float flowerGust = smoothstep(0.3, 0.85, texture2D(uNoiseTexture, flowerGustUv).r);
  float flowerRipple = texture2D(uNoiseTexture, flowerRoot.xz * 0.085 - uWindDirection * uTime * 0.32).b;
  float flowerWind = (0.18 + flowerGust * 0.8 + flowerRipple * 0.22) * uWindStrength;
  float flowerNod = sin(uTime * (1.6 + flowerSeed * 1.2) + flowerSeed * 29.0) * (0.05 + flowerGust * 0.08);
  vec2 flowerBend = uWindDirection * flowerWind * 0.38 + flowerFacing * (0.04 + flowerSeed * 0.1) + flowerAcross * flowerNod;

  for (int i = 0; i < FLOWER_MAX_PLAYERS; i++) {
    if (i >= uPlayerCount) break;
    vec3 player = uPlayers[i];
    vec2 delta = flowerRoot.xz - player.xz;
    float d2 = dot(delta, delta);
    if (d2 > 1.69) continue;
    float d = sqrt(d2);
    float push = 1.0 - d / 1.3;
    push *= push * 2.2 * (1.0 - smoothstep(1.2, 2.4, abs(player.y - flowerRoot.y)));
    flowerBend += (delta / max(d, 0.001)) * push;
  }

  float flowerBendAmount = length(flowerBend);
  if (flowerBendAmount > 1.2) {
    flowerBend *= 1.2 / flowerBendAmount;
    flowerBendAmount = 1.2;
  }

  vec3 flowerPosition;
  vec3 objectNormal;
  float flowerT = position.y;

  if (aPart < 0.5) {
    vec2 side = position.x * flowerFacing + position.z * flowerAcross;
    flowerPosition = flowerRoot;
    flowerPosition.xz += flowerBend * (flowerT * flowerT) * flowerHeight;
    flowerPosition.y += flowerT * flowerHeight * (1.0 - 0.3 * flowerBendAmount * flowerT);
    flowerPosition.xz += side * ${STEM_WIDTH.toFixed(3)} * (1.0 - 0.45 * flowerT) * 2.0;
    objectNormal = normalize(vec3(side.x * 0.6, 1.0, side.y * 0.6));
  } else {
    vec3 tip = flowerRoot + vec3(
      flowerBend.x * flowerHeight,
      flowerHeight * (1.0 - 0.3 * flowerBendAmount),
      flowerBend.y * flowerHeight
    );
    vec2 tiltDirection = normalize(flowerFacing * 0.6 + uSunFlat);
    float tilt = 0.25 + flowerSeed * 0.35;
    vec3 headUp = normalize(vec3(
      flowerBend.x * 0.8 + tiltDirection.x * tilt,
      1.0,
      flowerBend.y * 0.8 + tiltDirection.y * tilt
    ));
    headUp = normalize(mix(headUp, normalize(cameraPosition - tip), 0.5));
    vec3 headX = normalize(cross(vec3(flowerAcross.x, 0.0, flowerAcross.y), headUp));
    vec3 headZ = cross(headUp, headX);
    float headSize = aFlowerData.z * flowerFade;
    flowerPosition = tip + (headX * position.x + headZ * position.z) * headSize;
    objectNormal = headUp;
  }

  vFlowerUv = vec2((uv.x + aFlowerData.y) / ${SPECIES.length.toFixed(1)}, uv.y);
  vFlowerPart = aPart;
  vFlowerT = flowerT;
  vFlowerSeed = flowerSeed;
  vFlowerWorld = flowerPosition;

  #ifdef USE_TANGENT
    vec3 objectTangent = vec3(tangent.xyz);
  #endif
`;

function createFlowerMaterial(atlas) {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const sunFlat = new THREE.Vector2(SUN_DIRECTION.x, SUN_DIRECTION.z).normalize().multiplyScalar(0.8);

  const uniforms = {
    uTime: sharedUniforms.uTime,
    uWindDirection: sharedUniforms.uWindDirection,
    uWindStrength: sharedUniforms.uWindStrength,
    uNoiseTexture: sharedUniforms.uNoiseTexture,
    uSunDirection: sharedUniforms.uSunDirection,
    uPlayers: sharedUniforms.uPlayers,
    uPlayerCount: sharedUniforms.uPlayerCount,
    uSunFlat: { value: sunFlat },
    uFlowerAtlas: { value: atlas },
    uStemBase: { value: new THREE.Color('#2f5a1a') },
    uStemTip: { value: new THREE.Color('#6d9a36') },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = VERTEX_HEADER + shader.vertexShader
      .replace('#include <beginnormal_vertex>', NORMAL_MAIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = flowerPosition;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uFlowerAtlas;
        uniform vec3 uStemBase;
        uniform vec3 uStemTip;
        uniform vec3 uSunDirection;
        varying vec2 vFlowerUv;
        varying float vFlowerPart;
        varying float vFlowerT;
        varying float vFlowerSeed;
        varying vec3 vFlowerWorld;`,
      )
      .replace(
        '#include <color_fragment>',
        `if (vFlowerPart > 0.5) {
          vec4 petals = texture2D(uFlowerAtlas, vFlowerUv);
          if (petals.a < 0.42) discard;
          diffuseColor.rgb = petals.rgb / petals.a * (0.9 + vFlowerSeed * 0.2);
        } else {
          diffuseColor.rgb = mix(uStemBase, uStemTip, vFlowerT);
        }`,
      )
      .replace('#include <normal_fragment_begin>', normalBeginWithoutFlip())
      .replace('#include <lights_fragment_begin>', lightsBeginWithSunCapture())
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        float flowerOcclusion = mix(mix(0.35, 1.0, vFlowerT), 1.0, vFlowerPart);
        reflectedLight.indirectDiffuse *= flowerOcclusion;
        reflectedLight.directDiffuse *= mix(0.6, 1.0, max(vFlowerT, vFlowerPart));
        vec3 flowerViewDir = normalize(vFlowerWorld - cameraPosition);
        float flowerBackLight = pow(saturate(dot(flowerViewDir, uSunDirection)), 3.0);
        totalEmissiveRadiance += capturedSunLight * diffuseColor.rgb * (flowerBackLight * 0.45 + 0.05) * max(vFlowerT, vFlowerPart);`,
      );
  };

  material.customProgramCacheKey = () => 'meadow-flowers-v1';
  return material;
}

const MeadowFlowers = memo(function MeadowFlowers({ paths = [], count = 6500 }) {
  const atlas = useMemo(() => createFlowerAtlas(), []);
  const material = useMemo(() => createFlowerMaterial(atlas), [atlas]);

  const geometry = useMemo(() => {
    const { flowers, data, count: total } = generateFlowers(paths, count);
    const base = createFlowerGeometry();
    const instanced = new THREE.InstancedBufferGeometry();
    instanced.index = base.index;
    for (const name of ['position', 'normal', 'uv', 'aPart']) {
      instanced.setAttribute(name, base.getAttribute(name));
    }
    instanced.setAttribute('aFlower', new THREE.InstancedBufferAttribute(flowers, 4));
    instanced.setAttribute('aFlowerData', new THREE.InstancedBufferAttribute(data, 4));
    instanced.instanceCount = total;
    instanced.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), AREA * 0.75);
    instanced.boundingBox = new THREE.Box3(
      new THREE.Vector3(-AREA / 2, -4, -AREA / 2),
      new THREE.Vector3(AREA / 2, 6, AREA / 2),
    );
    return instanced;
  }, [paths, count]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => {
    material.dispose();
    atlas.dispose();
  }, [material, atlas]);

  return <mesh geometry={geometry} material={material} receiveShadow frustumCulled={false} />;
});

export default MeadowFlowers;
