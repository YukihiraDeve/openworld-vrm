import { Plane, Box } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
export default function Ground() {
  return (
    <>
    <RigidBody type="fixed" colliders="trimesh">
      <Plane
        args={[20, 20]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#172F00" />
      </Plane>
    </RigidBody>
    </>
  );
}