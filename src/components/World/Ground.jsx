import { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';

export default function Ground() {
  const groundSize = 100; // Increased size
  const segments = 100;   // Increased segments for detail
  const amplitude = 1;  // Height of the hills
  const frequency = 0.1;  // How spread out the hills are

  // Créer la géométrie pour le visuel
  const geometry = useMemo(() => {
    // Create base geometry
    const geom = new THREE.PlaneGeometry(groundSize, groundSize, segments, segments);
    const positions = geom.attributes.position.array;

    // Modify vertex heights
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      // Apply a simple wave function for hills
      positions[i + 2] = Math.sin(x * frequency) * Math.cos(y * frequency) * amplitude;
    }

    // Notify Three.js that geometry has changed
    geom.attributes.position.needsUpdate = true;
    // Recalculate normals for correct lighting
    geom.computeVertexNormals();
    return geom;
  }, [groundSize, segments, amplitude, frequency]);

  return (
    <>
      <RigidBody type="fixed" colliders="trimesh">
        {/* Visual mesh */}
        <mesh
          geometry={geometry}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          receiveShadow
        >
          <meshStandardMaterial color="#172F00" />
        </mesh>
      </RigidBody>
    </>
  );
}