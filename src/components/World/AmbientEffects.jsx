import { memo, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { calculateHeight } from './terrain';
import { createRandom } from './noise';
import { getVegetationLayout } from './vegetationLayout';
import { sharedUniforms } from './environment';

const VOLUME_SIZE = 34;
const MOTE_COUNT = 460;
const SEED_COUNT = 80;
const LEAVES_PER_TREE = 4;

const KIND_MOTE = 0;
const KIND_SEED = 1;
const KIND_LEAF = 2;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWindDirection;
  uniform vec3 uSunDirection;
  uniform vec3 uFocus;
  uniform float uVolume;
  uniform float uPointScale;

  attribute vec4 aParams;
  attribute vec3 aTint;
  attribute float aKind;

  varying vec3 vTint;
  varying float vAlpha;
  varying float vKind;
  varying float vRotation;
  varying float vGlint;

  #include <common>
  #include <fog_pars_vertex>

  void main() {
    float seed = aParams.x;
    float speed = aParams.y;
    float size = aParams.z;
    float extra = aParams.w;
    float phase = seed * 6.28318;
    vec3 world;
    float alpha = 1.0;
    vRotation = 0.0;

    if (aKind < 1.5) {
      vec3 p = position;
      float drift = aKind < 0.5 ? 0.45 : 1.1;
      p.xz += uWindDirection * uTime * drift * (0.5 + speed);
      p.xz += vec2(sin(uTime * 0.37 + phase), cos(uTime * 0.29 + phase * 1.7)) * (0.5 + speed * 0.6);
      vec2 rel = mod(p.xz - uFocus.xz + uVolume * 0.5, uVolume) - uVolume * 0.5;
      float bob = sin(uTime * (0.5 + speed * 0.6) + phase) * (aKind < 0.5 ? 0.25 : 0.6);
      world = vec3(uFocus.x + rel.x, uFocus.y + p.y + bob, uFocus.z + rel.y);
      alpha = 1.0 - smoothstep(uVolume * 0.3, uVolume * 0.5, length(rel));
      if (aKind > 0.5) vRotation = uTime * (0.3 + speed) + phase;
    } else {
      float cycle = fract(seed * 3.7 + uTime * (0.045 + speed * 0.035));
      float fallHeight = extra;
      float radius = 0.6 + speed * 1.2;
      float spin = cycle * 6.28318 * (1.5 + speed) + phase;
      world = position;
      world.y += fallHeight * (1.0 - cycle);
      world.x += cos(spin) * radius * 0.6;
      world.z += sin(spin) * radius * 0.6;
      world.xz += uWindDirection * cycle * (2.0 + speed * 3.0);
      alpha = smoothstep(0.0, 0.08, cycle) * (1.0 - smoothstep(0.86, 1.0, cycle));
      vRotation = spin * 1.7;
    }

    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float depth = max(-mvPosition.z, 0.5);
    gl_PointSize = clamp(size * uPointScale / depth, 1.0, 48.0);

    vec3 viewDir = normalize(world - cameraPosition);
    vGlint = pow(max(dot(viewDir, uSunDirection), 0.0), 6.0);
    alpha *= smoothstep(1.2, 3.0, depth) * (1.0 - smoothstep(26.0, 42.0, depth));
    vAlpha = alpha;
    vTint = aTint;
    vKind = aKind;

    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vTint;
  varying float vAlpha;
  varying float vKind;
  varying float vRotation;
  varying float vGlint;

  #include <common>
  #include <fog_pars_fragment>

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float shape;
    vec3 color = vTint;

    if (vKind < 0.5) {
      float r = length(p);
      shape = (1.0 - smoothstep(0.0, 1.0, r)) * (0.45 + 0.55 * (1.0 - smoothstep(0.0, 0.3, r)));
      shape *= 0.55 + vGlint * 0.45;
      color *= 0.8 + vGlint * 2.6;
    } else if (vKind < 1.5) {
      float c = cos(vRotation);
      float s = sin(vRotation);
      vec2 q = mat2(c, -s, s, c) * p;
      float r = length(q);
      float angle = atan(q.y, q.x);
      float spokes = pow(abs(cos(angle * 6.0)), 10.0) * (1.0 - smoothstep(0.25, 1.0, r));
      float core = 1.0 - smoothstep(0.0, 0.18, r);
      float halo = (1.0 - smoothstep(0.0, 0.9, r)) * 0.3;
      shape = max(max(core, spokes * 0.5), halo) * 0.8;
      color *= 0.85 + vGlint * 2.0;
    } else {
      float c = cos(vRotation);
      float s = sin(vRotation);
      vec2 q = mat2(c, -s, s, c) * p;
      float d = length(vec2(q.x * 1.9, q.y));
      shape = 1.0 - smoothstep(0.8, 0.95, d);
      float vein = 1.0 - smoothstep(0.0, 0.08, abs(q.x));
      color *= (0.82 + 0.18 * (1.0 - abs(q.x) * 1.6)) * (1.0 - vein * 0.18);
      color *= 0.75 + vGlint * 0.4;
    }

    float alpha = shape * vAlpha;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function createAmbientGeometry(trees) {
  const random = createRandom(0x51a7cafe);
  const leafCount = trees.length * LEAVES_PER_TREE;
  const total = MOTE_COUNT + SEED_COUNT + leafCount;

  const positions = new Float32Array(total * 3);
  const params = new Float32Array(total * 4);
  const tints = new Float32Array(total * 3);
  const kinds = new Float32Array(total);
  const leafColors = [
    new THREE.Color('#86b23a'),
    new THREE.Color('#b3b54c'),
    new THREE.Color('#c99a42'),
    new THREE.Color('#5f9a35'),
  ];

  let index = 0;
  const push = (kind, x, y, z, seed, speed, size, extra, tint) => {
    positions.set([x, y, z], index * 3);
    params.set([seed, speed, size, extra], index * 4);
    tints.set([tint.r, tint.g, tint.b], index * 3);
    kinds[index] = kind;
    index++;
  };

  const moteTint = new THREE.Color('#fff1c7');
  for (let i = 0; i < MOTE_COUNT; i++) {
    push(
      KIND_MOTE,
      random() * VOLUME_SIZE,
      0.3 + Math.pow(random(), 1.6) * 4.5,
      random() * VOLUME_SIZE,
      random(),
      random(),
      0.022 + random() * 0.02,
      0,
      moteTint,
    );
  }

  const seedTint = new THREE.Color('#ffffff');
  for (let i = 0; i < SEED_COUNT; i++) {
    push(
      KIND_SEED,
      random() * VOLUME_SIZE,
      0.8 + random() * 5.5,
      random() * VOLUME_SIZE,
      random(),
      random(),
      0.05 + random() * 0.03,
      0,
      seedTint,
    );
  }

  trees.forEach((tree) => {
    for (let i = 0; i < LEAVES_PER_TREE; i++) {
      const angle = random() * Math.PI * 2;
      const radius = (0.5 + random() * 2.2) * tree.scale;
      const x = tree.x + Math.cos(angle) * radius;
      const z = tree.z + Math.sin(angle) * radius;
      const ground = calculateHeight(x, z);
      const top = tree.y + tree.scale * (2.4 + random() * 2.2);
      push(
        KIND_LEAF,
        x,
        ground + 0.05,
        z,
        random(),
        random(),
        0.07 + random() * 0.04,
        Math.max(top - ground, 1.5),
        leafColors[Math.floor(random() * leafColors.length)],
      );
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
  return geometry;
}

const AmbientEffects = memo(function AmbientEffects({ paths = [] }) {
  const gl = useThree((state) => state.gl);
  const trees = useMemo(() => getVegetationLayout(paths).heroTrees, [paths]);
  const geometry = useMemo(() => createAmbientGeometry(trees), [trees]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          uTime: sharedUniforms.uTime,
          uWindDirection: sharedUniforms.uWindDirection,
          uSunDirection: sharedUniforms.uSunDirection,
          uFocus: { value: new THREE.Vector3() },
          uVolume: { value: VOLUME_SIZE },
          uPointScale: { value: 500 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const bufferSize = useMemo(() => new THREE.Vector2(), []);
  useFrame(({ camera }) => {
    const { position } = camera;
    material.uniforms.uFocus.value.set(position.x, calculateHeight(position.x, position.z), position.z);
    gl.getDrawingBufferSize(bufferSize);
    material.uniforms.uPointScale.value = bufferSize.y * 0.5 * camera.projectionMatrix.elements[5];
  });

  return (
    <points geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
  );
});

export default AmbientEffects;
