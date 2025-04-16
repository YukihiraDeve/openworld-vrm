import { Plane, Box } from '@react-three/drei';

export default function Ground() {
  return (
    <>
      <Plane
        args={[20, 20]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#172F00" />
      </Plane>
      
      <Box 
        args={[1, 1, 1]} 
        position={[0, 2, 0]}
        castShadow
      >
        <meshStandardMaterial color="#1E88E5" />
      </Box>
    </>
  );
}