import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense } from 'react';
import GrassField from './World/Grass';
import Sky from './World/Sky';
import EnvironmentController from './EnvironmentController';

export default function CustomCanvas({ children, sunPosition, setSunPosition, isDayNightCycleActive }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
        <Canvas
          camera={{ position: [0, 5, 10], fov: 50 }}
          shadows={{ type: THREE.PCFSoftShadowMap }} // Meilleure qualité d'ombre
          gl={{ antialias: true }}
        >
        <Suspense fallback={null}>
          <Sky sunPosition={sunPosition} />
          <GrassField 
            density={100000} 
            width={50} 
            height={50} 
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