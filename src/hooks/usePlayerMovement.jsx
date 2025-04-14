import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export default function usePlayerMovement(emitPlayerMove, emitPlayerAnimation, avatarRef) {
  const [locomotion, setLocomotion] = useState('idle');
  const [movementDirection, setMovementDirection] = useState(new THREE.Vector3(0, 0, 0));
  const [cameraAngle, setCameraAngle] = useState({ horizontal: 0, vertical: Math.PI / 8 });
  const cameraAngleRef = useRef(cameraAngle);

  const lastPosition = useRef(new THREE.Vector3());
  const lastQuaternion = useRef(new THREE.Quaternion());
  const lastLocomotion = useRef(locomotion);

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
    
    const newLocomotion = isMoving ? (isRunning ? 'run' : 'walk') : 'idle';
    if (newLocomotion !== locomotion) {
        setLocomotion(newLocomotion);
    }
  }, [locomotion]);

  const updateCameraAngleRef = useCallback(() => {
    cameraAngleRef.current = cameraAngle;
  }, [cameraAngle]);

  useFrame(() => {
    // LOG: Vérifier si avatarRef est défini et si emitPlayerMove existe
    //console.log(`[usePlayerMovement useFrame] avatarRef.current: ${avatarRef?.current ? 'Exists' : 'NULL'}, emitPlayerMove: ${emitPlayerMove ? 'Exists' : 'NULL'}`);

    if (!avatarRef?.current || !emitPlayerMove) return;

    // LOG: Vérifier avatarRef.current DIRECTEMENT
    console.log("[usePlayerMovement useFrame] Logging avatarRef.current directly:", avatarRef.current);

    const avatar = avatarRef.current;

    // LOG: Vérifier la variable 'avatar' après assignation
    console.log("[usePlayerMovement useFrame] Logging the 'avatar' variable after assignment:", avatar);

    // Tentative d'accès aux propriétés
    let currentPosition = null;
    let currentQuaternion = null;
    try {
      currentPosition = avatar?.position;
      currentQuaternion = avatar?.quaternion;
      // LOG: Afficher les propriétés si accessibles
      console.log("[usePlayerMovement useFrame] Accessed position:", currentPosition);
      console.log("[usePlayerMovement useFrame] Accessed quaternion:", currentQuaternion);
    } catch (e) {
      console.error("[usePlayerMovement useFrame] Error accessing position/quaternion:", e);
      console.error("[usePlayerMovement useFrame] Object causing error:", avatar);
    }

    if (!currentPosition || !currentQuaternion) {
        // LOG: Indiquer si position/quaternion sont invalides
        console.log("[usePlayerMovement useFrame] Position or Quaternion is invalid (either null, undefined, or access failed).");
        return;
    }

    const positionThresholdSq = 0.0001; // Seuil au carré
    const rotationThreshold = 0.001; // Radians

    const posDiffSq = currentPosition.distanceToSquared(lastPosition.current);
    const rotDiff = lastQuaternion.current.angleTo(currentQuaternion);

    // LOG: Afficher les différences calculées
    // console.log(`[usePlayerMovement useFrame] Pos Diff Sq: ${posDiffSq.toFixed(6)}, Rot Diff: ${rotDiff.toFixed(6)}`);

    const positionChanged = posDiffSq > positionThresholdSq;
    const rotationChanged = rotDiff > rotationThreshold;

    if (positionChanged || rotationChanged) {
      // LOG AJOUTÉ : Vérifier la position lue par ce hook
      console.log("[usePlayerMovement] Changement détecté, émission de :", currentPosition.x, currentPosition.y, currentPosition.z);
      emitPlayerMove({
        position: { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z },
        rotation: { x: currentQuaternion.x, y: currentQuaternion.y, z: currentQuaternion.z, w: currentQuaternion.w }
      });
      lastPosition.current.copy(currentPosition);
      lastQuaternion.current.copy(currentQuaternion);
    }
  });

  useEffect(() => {
    if (emitPlayerAnimation && locomotion !== lastLocomotion.current) {
        emitPlayerAnimation({ locomotion });
        lastLocomotion.current = locomotion;
    }
  }, [locomotion, emitPlayerAnimation]);

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