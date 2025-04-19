import React from 'react';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Sky.jsx — Gradient dome **+** ambient lighting
 * ------------------------------------------------
 * The component now injects a <hemisphereLight> whose sky/ground colours are
 * synced to the gradient, so the scene receives natural ambient light straight
 * from the sky. Remove any duplicate <ambientLight> in other files.
 */

// Gradient shader
const SkyGradientMaterial = shaderMaterial(
  {
    topColor: new THREE.Color('#4da4ff'),
    bottomColor: new THREE.Color('#cfefff')
  },
  /* glsl */
  `varying vec3 vWorldPosition;
   void main() {
     vec4 worldPosition = modelMatrix * vec4(position, 1.0);
     vWorldPosition = worldPosition.xyz;
     gl_Position = projectionMatrix * viewMatrix * worldPosition;
   }`,
  /* glsl */
  `uniform vec3 topColor;
   uniform vec3 bottomColor;
   varying vec3 vWorldPosition;
   void main() {
     float h = normalize(vWorldPosition).y * 0.5 + 0.5;
     vec3 col = mix(bottomColor, topColor, pow(h, 1.4));
     gl_FragColor = vec4(col, 1.0);
   }`
);
extend({ SkyGradientMaterial });

/**
 * @param {number} radius            – Dome radius (default 500)
 * @param {string|THREE.Color} topColor    – Zenith colour
 * @param {string|THREE.Color} bottomColor – Horizon / ground reflection colour
 * @param {number} ambientIntensity  – Strength of ambient light contributed by the sky
 */
export default function Sky({
  radius = 500,
  topColor = '#4da4ff',
  bottomColor = '#cfefff',
  ambientIntensity = 0.6
}) {
  const skyCol = new THREE.Color(topColor);
  const groundCol = new THREE.Color(bottomColor);

  return (
    <>
      {/* Gradient background */}
      <mesh scale={[-1, 1, 1]} renderOrder={-1}>
        <sphereGeometry args={[radius, 64, 32]} />
        <skyGradientMaterial side={THREE.BackSide} topColor={skyCol} bottomColor={groundCol} />
      </mesh>

      {/* Ambient/hemispheric light driven by the sky colours */}
      <hemisphereLight
        args={[skyCol, groundCol, ambientIntensity]}
      />
    </>
  );
}
