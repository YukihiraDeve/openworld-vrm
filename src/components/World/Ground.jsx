import { Plane } from '@react-three/drei';

export default function Ground() {
  return (
    <Plane
      args={[20, 20]}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -1, 0]}
      receiveShadow
    >
      <meshStandardMaterial color="#ffffff" />
    </Plane>
  );
}