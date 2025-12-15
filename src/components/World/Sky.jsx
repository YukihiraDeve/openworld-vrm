import React, { useMemo, useRef, useEffect } from 'react';
import { shaderMaterial, Clouds, Cloud } from '@react-three/drei';
import { extend, useThree, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

/**
 * Sky.jsx — Full environment lighting driven by the Sun
 * =====================================================
 * • Gradient dome for background.
 * • DirectionalLight + lens‑flare sprite share the **same position & colour**.
 * • Hemispheric ambient light still follows sky colours.
 *   👉   Plus de composant Lighting séparé : supprimez `Lighting.jsx` dans l'arbre.
 *
 * Presets : morning | noon | evening | night
 */

// ───────── Gradient shader ─────────
const SkyGradientMaterial = shaderMaterial(
  { topColor: new THREE.Color('#4da4ff'), bottomColor: new THREE.Color('#cfefff') },
  /* glsl */`
  varying vec3 vWorldPosition;
  void main(){
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorldPosition = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`,
  /* glsl */`
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
  noon: { topColor: '#4da4ff', bottomColor: '#cfefff', sunColor: '#fff9c4', sunPos: [0, 10, -10], amb: 0.8 },
  evening: { topColor: '#ff9b8e', bottomColor: '#ffd3b0', sunColor: '#ffb27d', sunPos: [10, 5, -10], amb: 0.45 },
  night: { topColor: '#0b1130', bottomColor: '#0d1a42', sunColor: '#ffffff', sunPos: [0, -5, -10], amb: 0.2, hideSun: true }
};

// ───────── Lens‑flare helper ─────────
function useLensflare(sunRef, textures, enabled) {
  const flare = React.useMemo(() => {
    if (!enabled || !textures || textures.length < 3) return null;
    const lf = new Lensflare();
    lf.addElement(new LensflareElement(textures[0], 700, 0));
    lf.addElement(new LensflareElement(textures[1], 100, 0.3));
    lf.addElement(new LensflareElement(textures[1], 60, 0.5));
    lf.addElement(new LensflareElement(textures[2], 120, 0.7));
    return lf;
  }, [textures, enabled]);
  useEffect(() => { if (sunRef.current && flare) sunRef.current.add(flare); }, [sunRef, flare]);
}

// ───────── Sky component ─────────
export default function Sky({
  preset = 'noon', radius = 500,
  flareTextures = [
    '/assets/textures/sun/lensflare0.png',
    '/assets/textures/sun/lensflare1.png',
    '/assets/textures/sun/lensflare2.png'],
  sunPosition,
  sunColor,
  ambientIntensity,
  lightIntensity = 1.0
}) {
  const p = PRESETS[preset] ?? PRESETS.noon;
  const flareTex = useLoader(THREE.TextureLoader, flareTextures);
  const sunRef = useRef();
  const dirLightRef = useRef();
  useLensflare(sunRef, flareTex, !p.hideSun);

  // Use props if provided, otherwise fallback to preset
  const finalTopColor = preset === 'noon' ? '#87CEEB' : p.topColor; // Match Simple_Grass blue
  const finalBottomColor = preset === 'noon' ? '#b0e2ff' : p.bottomColor;

  const topCol = new THREE.Color(finalTopColor);
  const groundCol = new THREE.Color(finalBottomColor);
  const finalSunColor = new THREE.Color(sunColor || p.sunColor);
  const finalSunPos = sunPosition || p.sunPos;
  const finalAmbInfo = ambientIntensity !== undefined ? ambientIntensity : p.amb;

  // Position of sun
  const sunDist = radius * 0.99;
  const sunVec = useMemo(() => new THREE.Vector3().fromArray(finalSunPos).normalize().multiplyScalar(sunDist), [finalSunPos, sunDist]);

  // Face camera
  const { camera } = useThree();
  useFrame(() => {
    sunRef.current && sunRef.current.quaternion.copy(camera.quaternion);

    // Exposer la référence de la lumière dans le contexte global
    if (dirLightRef.current && !window.mainDirectionalLight) {
      window.mainDirectionalLight = dirLightRef.current;
    }
  });

  return (
    <>
      {/* Gradient dome */}
      <mesh scale={[-1, 1, 1]} renderOrder={-1}>
        <sphereGeometry args={[radius, 64, 32]} />
        <skyGradientMaterial side={THREE.BackSide} topColor={topCol} bottomColor={groundCol} />
      </mesh>

      {/* Ambient light from sky colours */}
      <hemisphereLight args={[topCol, groundCol, finalAmbInfo]} />

      {/* Directional sunlight + sprite + flare */}
      {!p.hideSun && (
        <group position={sunVec}>
          {/* Visible sun sprite */}
          <sprite ref={sunRef} scale={[1, 1, 1]}>
            <spriteMaterial attach="material" color={finalSunColor} transparent opacity={1} depthWrite={false} />
          </sprite>
          {/* Actual lighting */}
          <directionalLight
            ref={dirLightRef}
            position={[0, 0, 0]} // already in group at sunVec
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

      {/* Volumetric Clouds */}
      <Clouds material={THREE.MeshLambertMaterial} limit={1000}>
        {/* Cluster 1: North-East - Large */}
        <Cloud
          seed={10}
          bounds={[50, 15, 50]}
          segments={60}
          volume={25}
          scale={15}
          growth={10}
          opacity={0.6}
          position={[120, 110, -100]}
          speed={0.1}
          color="#ffffff"
          fade={80}
        />
        {/* Cluster 2: West - Dense */}
        <Cloud
          seed={20}
          bounds={[40, 20, 40]}
          segments={50}
          volume={20}
          scale={18}
          growth={8}
          opacity={0.5}
          position={[-150, 100, -50]}
          speed={0.08}
          color="#f0f0f0"
          fade={100}
        />
        {/* Cluster 3: South - Scattered */}
        <Cloud
          seed={30}
          bounds={[60, 20, 60]}
          segments={40}
          volume={30}
          scale={20}
          growth={12}
          opacity={0.4}
          position={[30, 120, 150]}
          speed={0.05}
          color="#e8e8e8"
        />
        {/* Cluster 4: Distant High */}
        <Cloud
          seed={40}
          bounds={[80, 20, 80]}
          segments={40}
          volume={25}
          scale={25}
          growth={15}
          opacity={0.3}
          position={[-100, 160, 100]}
          speed={0.02}
          color="#d0d0d0"
        />
        {/* Cluster 5: Small low detail near horizon */}
        <Cloud
          seed={50}
          bounds={[30, 10, 30]}
          segments={30}
          volume={15}
          scale={12}
          growth={6}
          opacity={0.5}
          position={[0, 90, -180]}
          speed={0.12}
          color="#ffffff"
        />
      </Clouds>
    </>
  );
}
