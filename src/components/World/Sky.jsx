import React, { useMemo, useRef } from 'react';
import { shaderMaterial } from '@react-three/drei';
import { extend, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Sky.jsx — Full environment lighting driven by the Sun
 * =====================================================
 * • Gradient dome for background.
 * • Sun disc rendered as background (renderOrder -1), trees naturally cover it.
 * • HDR shader output + bloom post-processing → natural atmospheric glow.
 * • DirectionalLight for scene lighting + shadows.
 * • Hemispheric ambient light follows sky colours.
 *
 * Presets : morning | noon | evening | night
 */

// ───────── Sun disc shader (HDR output for bloom) ─────────
const SunMaterial = shaderMaterial(
  {
    uSunColor: new THREE.Color(1, 0.98, 0.92),
    uCoronaColor: new THREE.Color(1, 0.82, 0.45),
    uIntensity: 2.0,
  },
  /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`,
  /* glsl */ `
  uniform vec3 uSunColor;
  uniform vec3 uCoronaColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main(){
    float d = length(vUv - 0.5) * 2.0;

    if (d > 0.98) discard;

    float core = exp(-d * d * 55.0);
    float corona = exp(-d * d * 10.0);
    float atmo = exp(-d * d * 3.0);

    vec3 col = uSunColor * core * 4.0
             + mix(uSunColor, uCoronaColor, 0.4) * corona * 1.0
             + uCoronaColor * atmo * 0.2;

    col *= uIntensity;

    float alpha = 1.0 - smoothstep(0.5, 0.98, d);
    gl_FragColor = vec4(col, alpha);
  }`
);
extend({ SunMaterial });

// ───────── Gradient shader ─────────
const SkyGradientMaterial = shaderMaterial(
  { topColor: new THREE.Color('#4da4ff'), bottomColor: new THREE.Color('#cfefff') },
  /* glsl */ `
  varying vec3 vWorldPosition;
  void main(){
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorldPosition = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`,
  /* glsl */ `
  uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vWorldPosition;
  void main(){ float h = normalize(vWorldPosition).y*0.5+0.5;
    vec3 col = mix(bottomColor, topColor, pow(h,1.4));
    gl_FragColor = vec4(col,1.0);
  }`
);
extend({ SkyGradientMaterial });

// ───────── Presets ─────────
const PRESETS = {
  morning: { topColor: '#ffbfa5', bottomColor: '#ffe9cd', sunColor: '#ffd6a5', sunPos: [-10, 5, -10], amb: 0.55 },
  noon:    { topColor: '#4da4ff', bottomColor: '#cfefff', sunColor: '#fff9c4', sunPos: [0, 10, -10], amb: 0.8 },
  evening: { topColor: '#ff9b8e', bottomColor: '#ffd3b0', sunColor: '#ffb27d', sunPos: [10, 5, -10], amb: 0.45 },
  night:   { topColor: '#0b1130', bottomColor: '#0d1a42', sunColor: '#ffffff', sunPos: [0, -5, -10], amb: 0.2, hideSun: true },
};

// ───────── Sky component ─────────
export default function Sky({
  preset = 'noon',
  radius = 500,
  sunPosition,
  sunSize = 2.4,
  sunColor,
  ambientIntensity,
  lightIntensity = 1.0,
}) {
  const p = PRESETS[preset] ?? PRESETS.noon;
  const sunRef = useRef();
  const dirLightRef = useRef();

  const finalTopColor = preset === 'noon' ? '#87CEEB' : p.topColor;
  const finalBottomColor = preset === 'noon' ? '#b0e2ff' : p.bottomColor;

  const topCol = new THREE.Color(finalTopColor);
  const groundCol = new THREE.Color(finalBottomColor);
  const finalSunColor = new THREE.Color(sunColor || p.sunColor);
  const finalSunPos = sunPosition || p.sunPos;
  const finalSunSize = Math.max(0.1, sunSize);
  const finalAmbInfo = ambientIntensity !== undefined ? ambientIntensity : p.amb;

  const sunDist = radius * 0.88;
  const sunDir = useMemo(() => new THREE.Vector3().fromArray(finalSunPos).normalize(), [finalSunPos]);
  const sunVec = useMemo(() => sunDir.clone().multiplyScalar(sunDist), [sunDir, sunDist]);
  const lightVec = useMemo(() => sunDir.clone().multiplyScalar(radius * 0.99), [sunDir, radius]);

  const coronaColor = useMemo(
    () => new THREE.Color(finalSunColor.r * 0.95, finalSunColor.g * 0.7, finalSunColor.b * 0.25),
    [finalSunColor]
  );

  const { camera } = useThree();
  useFrame(() => {
    if (sunRef.current) sunRef.current.quaternion.copy(camera.quaternion);
    if (dirLightRef.current && !window.mainDirectionalLight) {
      window.mainDirectionalLight = dirLightRef.current;
    }
  });

  return (
    <>
      {/* Gradient dome — renders first as deepest background */}
      <mesh scale={[-1, 1, 1]} renderOrder={-2}>
        <sphereGeometry args={[radius, 64, 32]} />
        <skyGradientMaterial side={THREE.BackSide} topColor={topCol} bottomColor={groundCol} />
      </mesh>

      {/* Ambient light from sky colours */}
      <hemisphereLight args={[topCol, groundCol, finalAmbInfo]} />

      {/* Sun + directional light */}
      {!p.hideSun && (
        <group>
          {/*
           * Sun rendered as background layer (renderOrder -1, depthTest off).
           * Trees (renderOrder 0) render after and naturally overwrite the sun.
           * Bloom post-processing creates the atmospheric glow.
           */}
          <mesh
            ref={sunRef}
            position={sunVec}
            scale={[finalSunSize * 10, finalSunSize * 10, 1]}
            renderOrder={-1}
          >
            <circleGeometry args={[0.5, 64]} />
            <sunMaterial
              depthWrite={false}
              depthTest={false}
              blending={THREE.AdditiveBlending}
              uSunColor={finalSunColor}
              uCoronaColor={coronaColor}
              uIntensity={2.0}
            />
          </mesh>

          {/* Directional sunlight for scene lighting + shadows */}
          <directionalLight
            ref={dirLightRef}
            position={lightVec}
            intensity={lightIntensity}
            color={finalSunColor}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-50}
            shadow-camera-right={50}
            shadow-camera-top={50}
            shadow-camera-bottom={-50}
            shadow-camera-near={0.1}
            shadow-camera-far={1000}
            shadow-bias={-0.0001}
          />
        </group>
      )}
    </>
  );
}
