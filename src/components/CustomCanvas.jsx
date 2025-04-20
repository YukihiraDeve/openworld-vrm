import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense } from 'react';

import Grass from './World/GrassWithShadersUpdate';

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
        <Sky
          sunPosition={[5, 12, -8]}
          sunSize={1}
          sunColor='#fff3a0'
          ambientIntensity={0.65}
          preset='noon'
          
        />


        <Suspense fallback={null}>
          <Grass
            density={100000} 
            width={5} 
            height={5} 
            position={[0, 0 , 0]} 
          />

        </Suspense>

        {children}
      </Canvas>
    </div>
  );
}