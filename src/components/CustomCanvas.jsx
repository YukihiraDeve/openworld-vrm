import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useMemo } from 'react';
import GrassField from './World/Grass';
import densityGrass from '/assets/textures/grass_density.png';
import heightGrass from '/assets/textures/grass_height.png';
import typeGrass from '/assets/textures/grass.jpg';

export default function CustomCanvas({ children }) {
  const directionalLight = useMemo(() => {
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 15, 10);
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500;
    light.shadow.camera.left = -100;
    light.shadow.camera.right = 100;
    light.shadow.camera.top = 100;
    light.shadow.camera.bottom = -100;
    light.shadow.bias = -0.001;
    return light;
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 5, 10], fov: 50 }}
        shadows
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#87CEEB']} />
        <ambientLight intensity={0.6} />
        <primitive object={directionalLight} />
        
        <Suspense fallback={null}>
          {children}
          <GrassField 
            density={100000} 
            width={10} 
            height={10} 
            position={[0, -1, 0]} 
          />
        </Suspense>
      </Canvas>
    </div>
  );
}