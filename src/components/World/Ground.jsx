import { Plane, Box } from '@react-three/drei';

export default function Ground() {
  return (
    <>
      <Plane
        args={[20, 20]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#172F00" />
      </Plane>
  
    </>
  );
}