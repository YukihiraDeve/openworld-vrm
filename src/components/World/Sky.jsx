import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Sky, Cloud } from '@react-three/drei';

/**
 * SkyWithClouds component
 * Renders a deep summer sky gradient with fluffy, realistic clouds.
 * @param {{ sunPosition: THREE.Vector3 }} props
 */
export default function SkyWithClouds({ sunPosition = new THREE.Vector3(0, 20, -20) }) {
  // Generate random cloud configurations for fluffy shapes
  const cloudConfigs = useMemo(() => {
    const configs = [];
    for (let i = 0; i < 5; i++) {
      configs.push({
        position: [
          (Math.random() - 0.5) * 300,   // X spread
          Math.random() * 20 + 15,         // Y height 15–35
          (Math.random() - 0.5) * 300    // Z spread
        ],
        opacity: Math.random() * 0.2 + 0.8, // Bright white
        speed: Math.random() * 0.01 + 0.005, // Very slow drift
        width: Math.random() * 150 + 150,   // Width 150–300
        depth: Math.random() * 30 + 30,     // Depth 30–60
        segments: Math.floor(Math.random() * 30 + 30) // Segments 30–60 (smooth soft edges)
      });
    }
    return configs;
  }, []);

  const sunArray = useMemo(() => [sunPosition.x, sunPosition.y, sunPosition.z], [sunPosition]);

  return (
    <>
      {/* Deep blue summer sky gradient */}
      <Sky
        sunPosition={sunArray}
        turbidity={6}            // Moderate haze for richer gradient
        rayleigh={2.5}           // Enhanced blue scattering
        mieCoefficient={0.02}    // Slight atmospheric dust
        mieDirectionalG={0.7}     // Light directional bias
        distance={4500}
      />

      {/* Fluffy, realistic clouds */}
      {cloudConfigs.map((cfg, idx) => (
        <Cloud key={idx} {...cfg} />
      ))}
    </>
  );
}
