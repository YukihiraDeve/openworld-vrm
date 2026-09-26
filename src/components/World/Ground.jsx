import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody, TrimeshCollider, useRapier } from '@react-three/rapier';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { calculateHeight } from './terrain';
import { GRASS_COLORS, GROUND_COLORS, sharedUniforms } from './environment';
import { PATH_MASK_EXTENT, getPathMask } from './pathMask';
import { FANTASY_HOUSE_CONFIG } from './worldConfig';
import { TEXTURES } from '../../utils/const';

export { calculateHeight } from './terrain';

const TERRAIN_EXTENT = 760;
const DETAILED_EXTENT = 60;
const COLLIDER_EXTENT = 58;

// Grille régulière (1 m) au centre, puis de plus en plus espacée vers l'horizon
function buildAxis() {
  const coords = [];
  for (let v = -DETAILED_EXTENT; v <= DETAILED_EXTENT; v += 1) coords.push(v);
  let step = 1;
  let v = DETAILED_EXTENT;
  while (v < TERRAIN_EXTENT) {
    step *= 1.075;
    v = Math.min(v + step, TERRAIN_EXTENT);
    coords.push(v);
    coords.unshift(-v);
  }
  return coords;
}

function buildGridGeometry(xs, zs) {
  const positions = new Float32Array(xs.length * zs.length * 3);
  let offset = 0;
  for (let j = 0; j < zs.length; j++) {
    for (let i = 0; i < xs.length; i++) {
      positions[offset++] = xs[i];
      positions[offset++] = calculateHeight(xs[i], zs[j]);
      positions[offset++] = zs[j];
    }
  }

  const indices = [];
  const row = xs.length;
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildColliderData() {
  const axis = [];
  for (let v = -COLLIDER_EXTENT; v <= COLLIDER_EXTENT; v += 1) axis.push(v);
  const geometry = buildGridGeometry(axis, axis);
  const vertices = geometry.attributes.position.array;
  const indices = new Uint32Array(geometry.index.array);
  geometry.dispose();
  return { vertices, indices };
}

const colorUniform = (hex) => ({ value: new THREE.Color(hex) });

function createGroundMaterial({ pathMask, detailTexture, dirtTexture }) {
  const material = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const { footprint } = FANTASY_HOUSE_CONFIG;

  const uniforms = {
    uHouseCenter: { value: new THREE.Vector2(footprint.centerX, footprint.centerZ) },
    uHouseHalf: { value: new THREE.Vector2(footprint.halfWidth, footprint.halfDepth) },
    uPathMask: { value: pathMask },
    uPathMaskExtent: { value: PATH_MASK_EXTENT },
    uGroundDetail: { value: detailTexture },
    uDirtTexture: { value: dirtTexture },
    uNoiseTexture: sharedUniforms.uNoiseTexture,
    uLush: colorUniform(GROUND_COLORS.lush),
    uDry: colorUniform(GROUND_COLORS.dry),
    uDirt: colorUniform(GROUND_COLORS.dirt),
    uDirtDark: colorUniform(GROUND_COLORS.dirtDark),
    uCanopyLush: colorUniform(GRASS_COLORS.lush),
    uCanopyDeep: colorUniform(GRASS_COLORS.deep),
    uCanopyDry: colorUniform(GRASS_COLORS.dry),
    uForest: colorUniform('#2e4d22'),
    uRock: colorUniform('#8a8577'),
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGroundWorld;
        varying vec3 vGroundNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGroundNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGroundWorld;
        varying vec3 vGroundNormal;
        uniform sampler2D uPathMask;
        uniform float uPathMaskExtent;
        uniform sampler2D uGroundDetail;
        uniform sampler2D uDirtTexture;
        uniform sampler2D uNoiseTexture;
        uniform vec3 uLush;
        uniform vec3 uDry;
        uniform vec3 uDirt;
        uniform vec3 uDirtDark;
        uniform vec3 uCanopyLush;
        uniform vec3 uCanopyDeep;
        uniform vec3 uCanopyDry;
        uniform vec3 uForest;
        uniform vec3 uRock;
        uniform vec2 uHouseCenter;
        uniform vec2 uHouseHalf;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 wp = vGroundWorld.xz;

        float patchLarge = texture2D(uNoiseTexture, wp * 0.0125).r;
        float patchMid = texture2D(uNoiseTexture, wp * 0.045 + 0.31).g;
        float dryness = smoothstep(0.6, 0.86, patchLarge * 0.72 + patchMid * 0.38) * 0.85;
        float deepness = 1.0 - smoothstep(0.25, 0.5, patchMid);

        vec3 detail = texture2D(uGroundDetail, wp / 7.0).rgb;
        float detailLuma = dot(detail, vec3(0.299, 0.587, 0.114));
        vec3 meadow = mix(uLush, uDry, dryness) * (0.55 + detailLuma * 1.6);

        float camDist = distance(wp, cameraPosition.xz);
        vec3 canopy = mix(mix(uCanopyLush, uCanopyDeep, deepness * 0.6), uCanopyDry, dryness) * 0.78;
        meadow = mix(meadow, canopy, smoothstep(26.0, 60.0, camDist));

        float outerDist = max(abs(wp.x), abs(wp.y));
        float forestPatch = smoothstep(0.56, 0.68, texture2D(uNoiseTexture, wp * 0.0042 + vec2(0.5, 0.2)).g);
        meadow = mix(meadow, uForest, forestPatch * smoothstep(70.0, 130.0, outerDist) * 0.85);
        float forestFloor = smoothstep(51.0, 58.0, outerDist) * (1.0 - smoothstep(80.0, 94.0, outerDist));
        meadow = mix(meadow, uForest * (0.7 + detailLuma * 0.9), forestFloor * 0.65);
        float slope = 1.0 - clamp(vGroundNormal.y, 0.0, 1.0);
        meadow = mix(meadow, uRock * (0.8 + detailLuma * 0.6), smoothstep(0.32, 0.5, slope) * smoothstep(60.0, 90.0, outerDist));

        vec2 maskUv = wp / (2.0 * uPathMaskExtent) + 0.5;
        maskUv.y = 1.0 - maskUv.y;
        float mask = texture2D(uPathMask, maskUv).r;
        float edgeNoise = texture2D(uNoiseTexture, wp * 0.19).b - 0.5;
        float pathMix = smoothstep(0.28, 0.62, mask + edgeNoise * 0.4);

        vec2 houseDelta = abs(wp - uHouseCenter) - uHouseHalf;
        float houseOutside = length(max(houseDelta, 0.0)) + min(max(houseDelta.x, houseDelta.y), 0.0);
        pathMix = min(pathMix, smoothstep(0.0, 0.9, houseOutside + edgeNoise * 0.6));

        vec3 dirtSample = texture2D(uDirtTexture, wp / 4.5).rgb;
        float dirtLuma = dot(dirtSample, vec3(0.299, 0.587, 0.114));
        vec3 dirt = mix(uDirtDark, uDirt, smoothstep(0.18, 0.62, dirtLuma));
        dirt *= 0.82 + detailLuma * 0.55;
        dirt = mix(dirt * 0.78, dirt, smoothstep(0.0, 0.35, 1.0 - mask));

        diffuseColor.rgb = mix(dirt, meadow, pathMix);`,
      );
  };

  return material;
}

const Ground = memo(function Ground({ paths = [] }) {
  const gl = useThree((state) => state.gl);
  const { rapier } = useRapier();
  const [detailTexture, dirtTexture] = useTexture([
    TEXTURES.ground.rocky.diffuse1k,
    TEXTURES.paths.sandstone.diffuse1k,
  ]);

  useEffect(() => {
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    [detailTexture, dirtTexture].forEach((texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    });
  }, [detailTexture, dirtTexture, gl]);

  const geometry = useMemo(() => {
    const axis = buildAxis();
    return buildGridGeometry(axis, axis);
  }, []);

  const collider = useMemo(() => buildColliderData(), []);
  const pathMask = useMemo(() => getPathMask(paths).texture, [paths]);

  const material = useMemo(
    () => createGroundMaterial({ pathMask, detailTexture, dirtTexture }),
    [pathMask, detailTexture, dirtTexture],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => pathMask.dispose(), [pathMask]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow />
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider
          args={[collider.vertices, collider.indices, rapier.TriMeshFlags.FIX_INTERNAL_EDGES]}
          friction={1}
        />
      </RigidBody>
    </>
  );
});

export default Ground;
