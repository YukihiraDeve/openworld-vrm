import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense } from 'react';

import GrassGPT4 from './World/GrassGPT4';
import EnvironmentController from './EnvironmentController';
import SkyWithClouds from './World/Sky';

export default function CustomCanvas({ children, sunPosition, setSunPosition, isDayNightCycleActive }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 5, 10], fov: 50 }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        gl={{ antialias: true }}
      >
        {/* Sky and procedural clouds */}
        <SkyWithClouds sunPosition={sunPosition} />

        <Suspense fallback={null}>
          <GrassGPT4 
            density={100000} 
            width={5} 
            height={5} 
            position={[0, -1, 0]} 
          />
          <EnvironmentController
            sunPosition={sunPosition}
            setSunPosition={setSunPosition}
            isActive={isDayNightCycleActive}
          />
        </Suspense>

        {children}
      </Canvas>
    </div>
  );
}