import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

export default function CustomCanvas({ children }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 1, 5], fov: 50 }}
        background={new THREE.Color("#FF0000")}
        shadows
      >
        {children}
      </Canvas>
    </div>
  );
}