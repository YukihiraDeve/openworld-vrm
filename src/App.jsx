import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Plane } from '@react-three/drei';
import VrmAvatar from './components/VrmAvatar';
import * as THREE from 'three';

import { MODELS, ANIMATIONS } from './const';

function App() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 1, 5], fov: 50 }}
        background={new THREE.Color("#FF0000")}
        shadows
      >
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />

        <Plane
          args={[20, 20]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -1, 0]}
          receiveShadow
        >
          <meshStandardMaterial color="#ffffff" />
        </Plane>

        <Suspense fallback={null}>

          <VrmAvatar 
            vrmUrl={MODELS['WomanSkirtCharacter']} 
            animationUrl={ANIMATIONS['run']} 
            position={[0, -1, 0]} 
            scale={1}
          />

          <Environment preset="sunset" />
        </Suspense>

        <OrbitControls />
      </Canvas>
    </div>
  );
}

export default App;
