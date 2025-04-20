import React, { useMemo, useRef, useEffect } from 'react';
import { shaderMaterial } from '@react-three/drei';
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
  morning: { topColor:'#ffbfa5', bottomColor:'#ffe9cd', sunColor:'#ffd6a5', sunPos:[-10,5,-10], amb:0.55 },
  noon:    { topColor:'#4da4ff', bottomColor:'#cfefff', sunColor:'#fff9c4', sunPos:[0,10,-10],  amb:0.8  },
  evening: { topColor:'#ff9b8e', bottomColor:'#ffd3b0', sunColor:'#ffb27d', sunPos:[10,5,-10], amb:0.45 },
  night:   { topColor:'#0b1130', bottomColor:'#0d1a42', sunColor:'#ffffff', sunPos:[0,-5,-10], amb:0.2, hideSun:true }
};

// ───────── Lens‑flare helper ─────────
function useLensflare(sunRef, textures, enabled){
  const flare = React.useMemo(()=>{
    if(!enabled||!textures||textures.length<3) return null;
    const lf=new Lensflare();
    lf.addElement(new LensflareElement(textures[0],700,0));
    lf.addElement(new LensflareElement(textures[1],100,0.3));
    lf.addElement(new LensflareElement(textures[1],60,0.5));
    lf.addElement(new LensflareElement(textures[2],120,0.7));
    return lf;
  },[textures,enabled]);
  useEffect(()=>{if(sunRef.current&&flare) sunRef.current.add(flare);},[sunRef,flare]);
}

// ───────── Sky component ─────────
export default function Sky({
  preset='noon', radius=500,
  flareTextures=[
    '/assets/textures/sun/lensflare0.png',
    '/assets/textures/sun/lensflare1.png',
    '/assets/textures/sun/lensflare2.png']
}){
  const p = PRESETS[preset] ?? PRESETS.noon;
  const flareTex = useLoader(THREE.TextureLoader, flareTextures);
  const sunRef = useRef();
  useLensflare(sunRef, flareTex, !p.hideSun);

  const topCol = new THREE.Color(p.topColor);
  const groundCol = new THREE.Color(p.bottomColor);
  const sunCol = new THREE.Color(p.sunColor);

  // Position of sun
  const sunDist = radius*0.99;
  const sunVec = useMemo(()=> new THREE.Vector3().fromArray(p.sunPos).normalize().multiplyScalar(sunDist),[p.sunPos,sunDist]);

  // Face camera
  const { camera } = useThree();
  useFrame(()=>{ sunRef.current && sunRef.current.quaternion.copy(camera.quaternion); });

  return (
    <>
      {/* Gradient dome */}
      <mesh scale={[-1,1,1]} renderOrder={-1}>
        <sphereGeometry args={[radius,64,32]}/>
        <skyGradientMaterial side={THREE.BackSide} topColor={topCol} bottomColor={groundCol}/>
      </mesh>

      {/* Ambient light from sky colours */}
      <hemisphereLight args={[topCol, groundCol, p.amb]}/>

      {/* Directional sunlight + sprite + flare */}
      {!p.hideSun && (
        <group position={sunVec}>
          {/* Visible sun sprite */}
          <sprite ref={sunRef} scale={[1,1,1]}>
            <spriteMaterial attach="material" color={sunCol} transparent opacity={1} depthWrite={false}/>
          </sprite>
          {/* Actual lighting */}
          <directionalLight
            position={[0,0,0]} // already in group at sunVec
            intensity={3}
            color={sunCol}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
        </group>
      )}
    </>
  );
}
