import { memo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { WALL_HALF_SIZE } from './terrain';

const WALL_THICKNESS = 1;
const WALL_HEIGHT = 30;
const USER_DATA = { cameraPassThrough: true };

// Murs invisibles qui gardent les joueurs dans la zone jouable (le décor continue au-delà)
const WorldBounds = memo(function WorldBounds() {
  const offset = WALL_HALF_SIZE + WALL_THICKNESS / 2;
  const span = WALL_HALF_SIZE + WALL_THICKNESS;

  return (
    <RigidBody type="fixed" colliders={false} userData={USER_DATA}>
      <CuboidCollider args={[span, WALL_HEIGHT, WALL_THICKNESS / 2]} position={[0, 0, offset]} />
      <CuboidCollider args={[span, WALL_HEIGHT, WALL_THICKNESS / 2]} position={[0, 0, -offset]} />
      <CuboidCollider args={[WALL_THICKNESS / 2, WALL_HEIGHT, span]} position={[offset, 0, 0]} />
      <CuboidCollider args={[WALL_THICKNESS / 2, WALL_HEIGHT, span]} position={[-offset, 0, 0]} />
    </RigidBody>
  );
});

export default WorldBounds;
