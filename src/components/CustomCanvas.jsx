import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense } from 'react';

import GrassGPT4 from './World/GrassWithShadersUpdate';

import Sky from './World/Sky';

export default function CustomCanvas({ children }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 5, 10], fov: 50 }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        gl={{ antialias: true }}
      >
        {/* Sky and procedural clouds */}
        <Sky ambientIntensity={0.7} />


        <Suspense fallback={null}>
          <GrassGPT4 
            density={100000} 
            width={50} 
            height={50} 
            position={[0, 0 , 0]} 
          />

        </Suspense>

        {children}
      </Canvas>
    </div>
  );
}