import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';

export default function FollowCamera({ targetRef, angle }) {
  const { camera } = useThree();
  const [zoom, setZoom] = useState(5);
  const minZoom = 2;
  const maxZoom = 10;
  const lookAtOffset = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useEffect(() => {
    const handleWheel = (e) => {
      setZoom((prev) => {
        const newZoom = prev + e.deltaY * 0.01;
        return Math.max(minZoom, Math.min(maxZoom, newZoom));
      });
    };
    
    window.addEventListener('wheel', handleWheel);
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  useFrame(() => {
    if (targetRef && targetRef.current) {
      const targetPosition = new THREE.Vector3();
      targetRef.current.getWorldPosition(targetPosition);

      const desiredCameraPosition = new THREE.Vector3();
      desiredCameraPosition.x = targetPosition.x + zoom * Math.sin(angle.horizontal) * Math.cos(angle.vertical);
      desiredCameraPosition.y = targetPosition.y + zoom * Math.sin(angle.vertical) + lookAtOffset.y;
      desiredCameraPosition.z = targetPosition.z + zoom * Math.cos(angle.horizontal) * Math.cos(angle.vertical);

      camera.position.lerp(desiredCameraPosition, 0.1);

      const lookAtPosition = targetPosition.clone().add(lookAtOffset);
      camera.lookAt(lookAtPosition);
    }
  });

  return null;
}