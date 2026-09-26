import * as THREE from 'three';
import { sharedUniforms } from './environment';
import { lightsBeginWithSunCapture, normalBeginWithoutFlip } from './shaderUtils';

// Balancement du feuillage : le vent (direction monde) est ramené dans l'espace local de
// l'instance pour que tous les arbres penchent dans le même sens.
const SWAY_HEADER = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWindDirection;
  uniform float uWindStrength;
  uniform sampler2D uNoiseTexture;
  attribute float aSway;
`;

const SWAY_MAIN = /* glsl */ `
  #include <begin_vertex>
  {
    vec3 treeOrigin = vec3(0.0);
    mat3 treeBasis = mat3(1.0);
    #ifdef USE_INSTANCING
      treeOrigin = instanceMatrix[3].xyz;
      treeBasis = mat3(instanceMatrix);
    #endif
    vec3 windWorld = vec3(uWindDirection.x, 0.0, uWindDirection.y);
    float basisScale = max(dot(treeBasis[0], treeBasis[0]), 1e-4);
    vec3 windLocal = (windWorld * treeBasis) / basisScale;

    vec2 gustUv = treeOrigin.xz * 0.017 - uWindDirection * uTime * 0.085;
    float gust = smoothstep(0.3, 0.85, texture2D(uNoiseTexture, gustUv).r);
    float phase = dot(treeOrigin.xz, vec2(0.37, 0.61));
    float sway = aSway * aSway;
    float swing = (0.12 + gust * 0.42) * uWindStrength + sin(uTime * 1.3 + phase) * 0.06;
    transformed += windLocal * swing * sway;
    transformed += vec3(
      sin(uTime * 5.3 + position.y * 2.1 + position.x * 3.7 + phase),
      sin(uTime * 4.1 + position.z * 3.3 + phase) * 0.6,
      cos(uTime * 4.7 + position.x * 2.9 + position.z * 1.7 + phase)
    ) * 0.025 * aSway * (0.5 + gust);
  }
`;

function withSway(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = SWAY_HEADER + shader.vertexShader.replace('#include <begin_vertex>', SWAY_MAIN);
}

const swayUniforms = () => ({
  uTime: sharedUniforms.uTime,
  uWindDirection: sharedUniforms.uWindDirection,
  uWindStrength: sharedUniforms.uWindStrength,
  uNoiseTexture: sharedUniforms.uNoiseTexture,
});

// Feuillage « duveteux » : normales sphériques (précalculées dans la géométrie), occlusion interne,
// translucidité quand le soleil est derrière les feuilles.
export const CANOPY_COLORS = {
  inner: '#28481c',
  outer: '#5b8f31',
  highlight: '#a9cc4f',
};

export function createCanopyMaterial(
  leafTexture,
  { alphaTest = 0.42, alphaToCoverage = false, colors = CANOPY_COLORS } = {},
) {
  const material = new THREE.MeshLambertMaterial({
    map: leafTexture,
    alphaTest,
    alphaToCoverage,
    side: THREE.DoubleSide,
  });

  const uniforms = {
    ...swayUniforms(),
    uSunDirection: sharedUniforms.uSunDirection,
    uFocusPoint: sharedUniforms.uFocusPoint,
    uCanopyInner: { value: new THREE.Color(colors.inner) },
    uCanopyOuter: { value: new THREE.Color(colors.outer) },
    uCanopyHighlight: { value: new THREE.Color(colors.highlight) },
  };

  material.onBeforeCompile = (shader) => {
    withSway(shader, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aOcclusion;
        varying float vOcclusion;
        varying vec3 vLeafWorld;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vec4 leafWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          leafWorld = instanceMatrix * leafWorld;
        #endif
        vLeafWorld = (modelMatrix * leafWorld).xyz;
        vOcclusion = aOcclusion;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDirection;
        uniform vec3 uFocusPoint;
        uniform sampler2D uNoiseTexture;
        uniform vec3 uCanopyInner;
        uniform vec3 uCanopyOuter;
        uniform vec3 uCanopyHighlight;
        varying float vOcclusion;
        varying vec3 vLeafWorld;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float leafVariation = texture2D(uNoiseTexture, vLeafWorld.xz * 0.23 + vLeafWorld.y * 0.11).g;
        vec3 leafColor = mix(uCanopyInner, uCanopyOuter, smoothstep(0.1, 0.9, vOcclusion));
        leafColor = mix(leafColor, uCanopyHighlight, smoothstep(0.5, 0.85, leafVariation) * smoothstep(0.55, 1.0, vOcclusion) * 0.7);
        diffuseColor.rgb *= leafColor * (0.82 + 0.36 * leafVariation);`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
        vec3 leafFromCamera = vLeafWorld - cameraPosition;
        float leafCameraFade = smoothstep(1.0, 3.0, length(leafFromCamera));
        vec3 focusOffset = uFocusPoint - cameraPosition;
        float focusDistance = length(focusOffset);
        vec3 focusDirection = focusOffset / max(focusDistance, 1e-3);
        float alongFocus = dot(leafFromCamera, focusDirection);
        if (alongFocus > 0.0 && alongFocus < focusDistance - 0.4) {
          float radial = length(leafFromCamera - focusDirection * alongFocus);
          leafCameraFade = min(leafCameraFade, smoothstep(0.7, 1.9, radial));
        }
        if (leafCameraFade < 1.0) {
          float leafDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (leafDither > leafCameraFade) discard;
        }`,
      )
      .replace('#include <normal_fragment_begin>', normalBeginWithoutFlip())
      .replace('#include <lights_fragment_begin>', lightsBeginWithSunCapture())
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= mix(0.38, 1.0, vOcclusion);
        reflectedLight.directDiffuse *= mix(0.5, 1.0, vOcclusion);
        vec3 leafViewDir = normalize(vLeafWorld - cameraPosition);
        float leafBackLight = pow(saturate(dot(leafViewDir, uSunDirection)), 4.0);
        totalEmissiveRadiance += capturedSunLight * diffuseColor.rgb * (leafBackLight * 0.5 + 0.035) * (0.35 + 0.65 * vOcclusion);`,
      );
  };

  material.customProgramCacheKey = () => `canopy-${alphaToCoverage ? 'a2c' : 'at'}`;
  return material;
}

export function createCanopyDepthMaterial(leafTexture, alphaTest = 0.42) {
  const material = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: leafTexture,
    alphaTest,
    side: THREE.DoubleSide,
  });
  const uniforms = swayUniforms();
  material.onBeforeCompile = (shader) => withSway(shader, uniforms);
  material.customProgramCacheKey = () => 'canopy-depth';
  return material;
}

export function createTrunkMaterial(color = '#7d5b3e') {
  const material = new THREE.MeshLambertMaterial({ color });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTrunkHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrunkHeight = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTrunkHeight;')
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        float trunkOcclusion = mix(0.6, 1.0, smoothstep(0.0, 1.0, vTrunkHeight));
        reflectedLight.indirectDiffuse *= trunkOcclusion;
        reflectedLight.directDiffuse *= mix(0.8, 1.0, trunkOcclusion);`,
      );
  };
  material.customProgramCacheKey = () => 'trunk';
  return material;
}

// Normales sphériques (mélange blob / silhouette de l'arbre), occlusion et facteur de balancement
export function applyCanopyAttributes(geometries) {
  const bounds = new THREE.Box3();
  geometries.forEach((geometry) => {
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox);
  });
  const treeCenter = bounds.getCenter(new THREE.Vector3());
  const treeSize = bounds.getSize(new THREE.Vector3());
  const blobCenter = new THREE.Vector3();
  const point = new THREE.Vector3();
  const blobNormal = new THREE.Vector3();
  const treeNormal = new THREE.Vector3();

  geometries.forEach((geometry) => {
    geometry.computeBoundingSphere();
    blobCenter.copy(geometry.boundingSphere.center);
    const radius = Math.max(geometry.boundingSphere.radius, 1e-3);
    const position = geometry.attributes.position;
    const normals = new Float32Array(position.count * 3);
    const occlusion = new Float32Array(position.count);
    const sway = new Float32Array(position.count);

    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      blobNormal.subVectors(point, blobCenter).normalize();
      treeNormal.subVectors(point, treeCenter);
      treeNormal.y *= 0.8;
      treeNormal.normalize();
      blobNormal.multiplyScalar(0.62).addScaledVector(treeNormal, 0.38).normalize();
      normals[i * 3] = blobNormal.x;
      normals[i * 3 + 1] = blobNormal.y;
      normals[i * 3 + 2] = blobNormal.z;

      const shell = Math.min(point.distanceTo(blobCenter) / radius, 1);
      const height = (point.y - bounds.min.y) / Math.max(treeSize.y, 1e-3);
      occlusion[i] = Math.pow(shell, 0.8) * (0.62 + 0.38 * height);
      sway[i] = Math.min(Math.max(height, 0), 1);
    }

    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('aOcclusion', new THREE.BufferAttribute(occlusion, 1));
    geometry.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  });
}

export const TREE_TINTS = [
  new THREE.Color('#ffffff'),
  new THREE.Color('#f2ffe0'),
  new THREE.Color('#fff4d6'),
  new THREE.Color('#e3f6e8'),
  new THREE.Color('#fbe9b8'),
];

export function pickTreeTint(value, target = new THREE.Color()) {
  return target.copy(TREE_TINTS[Math.floor(value * TREE_TINTS.length) % TREE_TINTS.length]);
}
