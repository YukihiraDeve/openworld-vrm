import { useState, useCallback, useRef } from 'react';
import * as THREE from 'three';

export default function usePlayerMovement() {
  const [locomotion, setLocomotion] = useState('idle');
  const [movementDirection, setMovementDirection] = useState(new THREE.Vector3(0, 0, 0));
  const [cameraAngle, setCameraAngle] = useState({ horizontal: 0, vertical: Math.PI / 8 });
  const cameraAngleRef = useRef(cameraAngle);

  const updateMovement = useCallback((keysPressed) => {
    const horizontalAngle = cameraAngleRef.current.horizontal;

    const cameraForward = new THREE.Vector3(-Math.sin(horizontalAngle), 0, -Math.cos(horizontalAngle));
    const cameraRight = new THREE.Vector3(Math.cos(horizontalAngle), 0, -Math.sin(horizontalAngle));

    const finalMoveDirection = new THREE.Vector3(0, 0, 0);
    let isMoving = false;
    const isRunning = keysPressed.current.ShiftLeft || keysPressed.current.ShiftRight;

    if (keysPressed.current.KeyW) {
      finalMoveDirection.add(cameraForward);
      isMoving = true;
    }
    if (keysPressed.current.KeyS) {
      finalMoveDirection.sub(cameraForward);
      isMoving = true;
    }
    if (keysPressed.current.KeyA) {
      finalMoveDirection.sub(cameraRight);
      isMoving = true;
    }
    if (keysPressed.current.KeyD) {
      finalMoveDirection.add(cameraRight);
      isMoving = true;
    }

    if (finalMoveDirection.lengthSq() > 0) {
      finalMoveDirection.normalize();
    }

    setMovementDirection(finalMoveDirection);
    
    if (isMoving) {
      setLocomotion(isRunning ? 'run' : 'walk');
    } else {
      setLocomotion('idle');
    }
  }, []);

  // Mise à jour de la ref quand l'état change
  const updateCameraAngleRef = useCallback(() => {
    cameraAngleRef.current = cameraAngle;
  }, [cameraAngle]);

  return {
    locomotion,
    movementDirection,
    cameraAngle,
    setCameraAngle,
    cameraAngleRef,
    updateMovement,
    updateCameraAngleRef
  };
}