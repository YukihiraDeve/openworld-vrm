import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';

export default function FollowCamera({ targetRef, angle }) {
  const { camera } = useThree();
  const cameraDistance = 5;
  const lookAtOffset = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame(() => {
    if (targetRef && targetRef.current) {
      const targetPosition = new THREE.Vector3();
      targetRef.current.getWorldPosition(targetPosition);

      const desiredCameraPosition = new THREE.Vector3();
      desiredCameraPosition.x = targetPosition.x + cameraDistance * Math.sin(angle.horizontal) * Math.cos(angle.vertical);
      desiredCameraPosition.y = targetPosition.y + cameraDistance * Math.sin(angle.vertical) + lookAtOffset.y;
      desiredCameraPosition.z = targetPosition.z + cameraDistance * Math.cos(angle.horizontal) * Math.cos(angle.vertical);

      camera.position.lerp(desiredCameraPosition, 0.1);

      const lookAtPosition = targetPosition.clone().add(lookAtOffset);
      camera.lookAt(lookAtPosition);
    }
  });

  return null;
}