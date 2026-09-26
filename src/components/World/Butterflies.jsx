import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { calculateHeight } from './terrain';
import { createRandom } from './noise';
import { flowerPatchValue } from './vegetationLayout';
import { getExclusionDensity, WORLD_EXCLUSION_ZONES } from './worldConfig';
import { sharedUniforms } from './environment';
import { lightsBeginWithSunCapture, normalBeginWithoutFlip } from './shaderUtils';

const COUNT = 26;
const WING_TYPES = 4;
const WING_CELL = 128;
const BASE_SCALE = 0.09;
const FADE_START = 28;
const FADE_END = 38;

function forewingPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(4, 46);
  ctx.bezierCurveTo(28, 8, 88, -2, 123, 12);
  ctx.bezierCurveTo(120, 40, 102, 62, 70, 68);
  ctx.bezierCurveTo(42, 71, 16, 67, 4, 62);
  ctx.closePath();
}

function hindwingPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(4, 58);
  ctx.bezierCurveTo(42, 56, 88, 68, 94, 94);
  ctx.bezierCurveTo(98, 118, 62, 127, 36, 119);
  ctx.bezierCurveTo(16, 111, 6, 90, 4, 72);
  ctx.closePath();
}

function drawWing(ctx, { inner, outer, border, borderWidth, veins, dots, tip, spot }) {
  for (const shape of [hindwingPath, forewingPath]) {
    ctx.save();
    shape(ctx);
    const gradient = ctx.createRadialGradient(0, 64, 4, 0, 64, 130);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.clip();

    if (tip) {
      ctx.fillStyle = tip;
      ctx.beginPath();
      ctx.ellipse(122, 14, 34, 22, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (veins) {
      ctx.strokeStyle = veins;
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const angle = -0.9 + i * 0.3;
        ctx.beginPath();
        ctx.moveTo(4, 62);
        ctx.quadraticCurveTo(50 * Math.cos(angle), 62 + 50 * Math.sin(angle), 140 * Math.cos(angle), 62 + 140 * Math.sin(angle));
        ctx.stroke();
      }
    }

    if (spot) {
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.arc(70, 38, 5, 0, Math.PI * 2);
      ctx.arc(52, 96, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (border) {
      shape(ctx);
      ctx.strokeStyle = border;
      ctx.lineWidth = borderWidth;
      ctx.stroke();
    }

    if (dots) {
      ctx.fillStyle = dots;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        ctx.beginPath();
        ctx.arc(118 - t * 40, 18 + t * 44, 2, 0, Math.PI * 2);
        ctx.arc(90 - t * 50, 98 + t * 18, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function createWingAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = WING_CELL * WING_TYPES;
  canvas.height = WING_CELL;
  const ctx = canvas.getContext('2d');

  const designs = [
    { inner: '#ffb347', outer: '#e8630f', border: '#1b120c', borderWidth: 9, veins: '#2a1a10', dots: '#fff8e8' },
    { inner: '#9ad8ff', outer: '#1d58d0', border: '#0f1934', borderWidth: 8, dots: '#dfefff' },
    { inner: '#fff27a', outer: '#e9d03c', border: '#b39a2c', borderWidth: 2, spot: '#f08c24' },
    { inner: '#ffffff', outer: '#ece9dc', border: '#bdb9a8', borderWidth: 2, tip: '#2b2a28', spot: '#2b2a28' },
  ];

  designs.forEach((design, index) => {
    ctx.save();
    ctx.translate(index * WING_CELL, 0);
    drawWing(ctx, design);
    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = true;
  texture.needsUpdate = true;
  return texture;
}

// Avant = +z, ailes le long de ±x, corps au centre (aWing = 0)
function createButterflyGeometry() {
  const positions = [];
  const uvs = [];
  const wings = [];
  const indices = [];

  const addQuad = (corners, quadUvs, wing) => {
    const start = positions.length / 3;
    corners.forEach((corner) => positions.push(...corner));
    quadUvs.forEach((uv) => uvs.push(...uv));
    wings.push(wing, wing, wing, wing);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };

  const wingUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  addQuad([[0, 0, -0.55], [1, 0, -0.55], [1, 0, 0.65], [0, 0, 0.65]], wingUvs, 1);
  addQuad([[0, 0, -0.55], [-1, 0, -0.55], [-1, 0, 0.65], [0, 0, 0.65]], wingUvs, -1);
  addQuad([[-0.05, 0, -0.45], [0.05, 0, -0.45], [0.05, 0, 0.5], [-0.05, 0, 0.5]], wingUvs, 0);
  addQuad([[0, -0.05, -0.45], [0, 0.05, -0.45], [0, 0.05, 0.5], [0, -0.05, 0.5]], wingUvs, 0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(positions.length).fill(0), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aWing', new THREE.Float32BufferAttribute(wings, 1));
  geometry.setIndex(indices);
  return geometry;
}

function createButterflyMaterial(atlas) {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const uniforms = {
    uTime: sharedUniforms.uTime,
    uSunDirection: sharedUniforms.uSunDirection,
    uWingAtlas: { value: atlas },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        attribute float aWing;
        attribute vec3 aFlap;
        varying vec2 vWingUv;
        varying float vWingPart;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = vec3(0.0, 1.0, 0.0);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = position;
        float flapCycle = uTime * aFlap.x + aFlap.y;
        float glide = smoothstep(0.55, 0.85, sin(uTime * 0.55 + aFlap.y * 2.3));
        float wingAngle = mix(
          sin(flapCycle) * 0.95 + 0.3,
          0.26 + sin(uTime * 2.1 + aFlap.y) * 0.07,
          glide
        );
        if (abs(aWing) > 0.5) {
          float reach = abs(position.x);
          transformed.x = aWing * reach * cos(wingAngle);
          transformed.y = reach * sin(wingAngle);
        }
        vWingUv = vec2((uv.x + aFlap.z) / ${WING_TYPES.toFixed(1)}, uv.y);
        vWingPart = abs(aWing);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uWingAtlas;
        uniform vec3 uSunDirection;
        varying vec2 vWingUv;
        varying float vWingPart;`,
      )
      .replace(
        '#include <color_fragment>',
        `if (vWingPart > 0.5) {
          vec4 wing = texture2D(uWingAtlas, vWingUv);
          if (wing.a < 0.5) discard;
          diffuseColor.rgb = wing.rgb / wing.a;
        } else {
          diffuseColor.rgb = vec3(0.1, 0.075, 0.06);
        }`,
      )
      .replace('#include <normal_fragment_begin>', normalBeginWithoutFlip())
      .replace('#include <lights_fragment_begin>', lightsBeginWithSunCapture())
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        vec3 wingSunView = normalize((viewMatrix * vec4(uSunDirection, 0.0)).xyz);
        float wingBackLight = pow(saturate(dot(normalize(-vViewPosition), wingSunView)), 3.0);
        totalEmissiveRadiance += capturedSunLight * diffuseColor.rgb * (wingBackLight * 0.5 + 0.08) * vWingPart;`,
      );
  };

  material.customProgramCacheKey = () => 'butterflies-v1';
  return material;
}

function createButterflies() {
  const random = createRandom(0xb077e7);
  const list = [];
  for (let attempt = 0; attempt < 4000 && list.length < COUNT; attempt++) {
    const x = (random() - 0.5) * 96;
    const z = (random() - 0.5) * 96;
    if (flowerPatchValue(x, z) < 0.62) continue;
    if (getExclusionDensity(x, z, WORLD_EXCLUSION_ZONES) < 1) continue;
    list.push({
      homeX: x,
      homeZ: z,
      radius: 2 + random() * 3.5,
      speed: 0.55 + random() * 0.5,
      height: 0.45 + random() * 0.6,
      size: 0.8 + random() * 0.45,
      phases: Array.from({ length: 6 }, () => random() * Math.PI * 2),
      flapSpeed: 24 + random() * 10,
      type: Math.floor(random() * WING_TYPES),
    });
  }
  return list;
}

function sampleFlight(butterfly, time, target) {
  const { homeX, homeZ, radius, speed, height, phases } = butterfly;
  const t = time * speed;
  const x = homeX
    + Math.cos(t * 0.23 + phases[0]) * radius
    + Math.sin(t * 0.61 + phases[1]) * radius * 0.35
    + Math.sin(t * 1.9 + phases[2]) * 0.12;
  const z = homeZ
    + Math.sin(t * 0.19 + phases[2]) * radius
    + Math.cos(t * 0.53 + phases[3]) * radius * 0.35
    + Math.cos(t * 2.3 + phases[0]) * 0.12;
  const y = calculateHeight(x, z)
    + height
    + Math.sin(t * 0.9 + phases[4]) * 0.3
    + Math.max(0, Math.sin(t * 0.17 + phases[5])) * 1.3
    + Math.sin(time * 6.5 + phases[1]) * 0.05;
  return target.set(x, y, z);
}

const Butterflies = memo(function Butterflies() {
  const meshRef = useRef(null);
  const butterflies = useMemo(() => createButterflies(), []);
  const atlas = useMemo(() => createWingAtlas(), []);
  const material = useMemo(() => createButterflyMaterial(atlas), [atlas]);

  const geometry = useMemo(() => {
    const base = createButterflyGeometry();
    const flap = new Float32Array(butterflies.length * 3);
    butterflies.forEach((butterfly, index) => {
      flap[index * 3] = butterfly.flapSpeed;
      flap[index * 3 + 1] = butterfly.phases[0] * 3;
      flap[index * 3 + 2] = butterfly.type;
    });
    base.setAttribute('aFlap', new THREE.InstancedBufferAttribute(flap, 3));
    return base;
  }, [butterflies]);

  const temp = useMemo(() => ({
    current: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    euler: new THREE.Euler(0, 0, 0, 'YXZ'),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    atlas.dispose();
  }, [geometry, material, atlas]);

  useFrame(({ camera, clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = clock.elapsedTime;
    const { current, ahead, direction, euler, quaternion, scale, matrix } = temp;

    for (let i = 0; i < butterflies.length; i++) {
      const butterfly = butterflies[i];
      sampleFlight(butterfly, time, current);
      sampleFlight(butterfly, time + 0.12, ahead);
      direction.subVectors(ahead, current);
      const horizontal = Math.hypot(direction.x, direction.z);
      const yaw = Math.atan2(direction.x, direction.z);
      const pitch = -THREE.MathUtils.clamp(Math.atan2(direction.y, horizontal), -0.5, 0.5) - 0.12;
      euler.set(pitch, yaw, Math.sin(time * 1.3 + butterfly.phases[3]) * 0.15);
      quaternion.setFromEuler(euler);

      const distance = current.distanceTo(camera.position);
      const visibility = 1 - THREE.MathUtils.smoothstep(distance, FADE_START, FADE_END);
      scale.setScalar(BASE_SCALE * butterfly.size * visibility);
      matrix.compose(current, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (butterflies.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, butterflies.length]}
      frustumCulled={false}
    />
  );
});

export default Butterflies;
