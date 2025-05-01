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
    const isJumping = keysPressed.current.Space;

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

    // Si l'avatar est défini et qu'une touche de saut est pressée
    if (isJumping && avatarRef.current && avatarRef.current.rigidBodyRef?.current) {
      // Vérifier si le personnage est au sol avant de sauter
      const position = avatarRef.current.rigidBodyRef.current.translation();
      const velocity = avatarRef.current.rigidBodyRef.current.linvel();
      
      // Améliorer la détection du sol avec une marge plus grande
      // Utilisation d'une marge plus élevée et détection moins stricte pour éviter les blocages
      const isGrounded = position.y < 2.0 && Math.abs(velocity.y) < 1.0;
      
      if (isGrounded) {
        // Force du saut basée sur l'état de course ou marche
        const jumpForce = isRunning ? 14 : 10;
        
        // Toujours ajouter une petite force de déblocage horizontale, même si immobile
        const movementScale = finalMoveDirection.lengthSq() > 0 ? 2.5 : 0.5;
        const jumpDirection = finalMoveDirection.lengthSq() > 0 
          ? finalMoveDirection.clone() 
          : new THREE.Vector3(Math.random() * 0.6 - 0.3, 0, Math.random() * 0.6 - 0.3);
        
        // Petit boost initial vers le haut avant l'impulsion principale
        // Cela aide à se "décoller" du sol avant d'appliquer la force principale
        avatarRef.current.rigidBodyRef.current.applyImpulse({
          x: 0,
          y: 2.0,
          z: 0
        });
        
        // Après un court délai, appliquer l'impulsion principale
        setTimeout(() => {
          if (avatarRef.current && avatarRef.current.rigidBodyRef?.current) {
            avatarRef.current.rigidBodyRef.current.applyImpulse({
              x: jumpDirection.x * movementScale,
              y: jumpForce, 
              z: jumpDirection.z * movementScale
            });
          }
        }, 30);
      } else if (position.y < 3.0) {
        // Même si pas complètement au sol, permettre un "petit saut" si on est près du sol
        // Cela aide à se débloquer des situations où on est légèrement au-dessus du sol
        avatarRef.current.rigidBodyRef.current.applyImpulse({
          x: finalMoveDirection.x * 1.5,
          y: 6, 
          z: finalMoveDirection.z * 1.5
        });
      }
    }

    setMovementDirection(finalMoveDirection);
    
    const newLocomotion = isMoving ? (isRunning ? 'run' : 'walk') : 'idle';
    if (newLocomotion !== locomotion) {
        setLocomotion(newLocomotion);
    }
  }, [locomotion, avatarRef]);

  const updateCameraAngleRef = useCallback(() => {
    cameraAngleRef.current = cameraAngle;
  }, [cameraAngle]);

  useFrame(() => {
    // Vérifier si l'avatar et son rigidBody sont prêts, et si emitPlayerMove existe
    if (!avatarRef?.current?.rigidBodyRef?.current || !emitPlayerMove) {
      return;
    }

    const avatarGroup = avatarRef.current; // <-- Ref au groupe visuel
    const rigidBody = avatarGroup.rigidBodyRef.current; // <-- Ref au corps physique

    let currentPositionVec = null;
    let currentRotationQuat = null;
    try {
      currentPositionVec = rigidBody.translation();       // <-- Lire la POSITION depuis rigidBody
      currentRotationQuat = avatarGroup.quaternion;    // <-- Lire la ROTATION depuis le groupe visuel
    } catch (e) {
        console.error("[usePlayerMovement] Erreur lecture rigidBody ou group:", e);
        return;
    }

    // Vérifier si les objets retournés sont valides
    if (!currentPositionVec || typeof currentPositionVec.x === 'undefined' || 
        !currentRotationQuat || typeof currentRotationQuat.w === 'undefined') {
        console.log("[usePlayerMovement useFrame] Invalid position or rotation object.");
        return;
    }
    
     // Convertir la position Vector3 en objet simple {x, y, z}
    const currentPosition = {
        x: currentPositionVec.x,
        y: currentPositionVec.y,
        z: currentPositionVec.z
    };
    // Cloner le quaternion pour éviter les mutations accidentelles si nécessaire
    // et s'assurer que c'est un objet simple {x, y, z, w}
    const currentQuaternion = {
        x: currentRotationQuat.x,
        y: currentRotationQuat.y,
        z: currentRotationQuat.z,
        w: currentRotationQuat.w
    }; 


    const positionThresholdSq = 0.0001; // Seuil au carré
    const rotationThreshold = 0.001; // Radians
    
    // Comparaison de position
    const tempCurrentPosVec3 = new THREE.Vector3(currentPosition.x, currentPosition.y, currentPosition.z);
    const posDiffSq = tempCurrentPosVec3.distanceToSquared(lastPosition.current);

    // Comparaison de rotation
    const tempCurrentRotQuat = new THREE.Quaternion(currentQuaternion.x, currentQuaternion.y, currentQuaternion.z, currentQuaternion.w);
    const rotDiff = lastQuaternion.current.angleTo(tempCurrentRotQuat);

    // LOG: Afficher les différences calculées
    // console.log(`[usePlayerMovement useFrame] Pos Diff Sq: ${posDiffSq.toFixed(6)}, Rot Diff: ${rotDiff.toFixed(6)}`);

    const positionChanged = posDiffSq > positionThresholdSq;
    const rotationChanged = rotDiff > rotationThreshold;

    if (positionChanged || rotationChanged) {
      // console.log("Emitting move from usePlayerMovement:", { position: currentPosition, rotation: currentQuaternion }); // Décommenter pour log
      emitPlayerMove({
        position: currentPosition,
        rotation: currentQuaternion
      });
      // Mettre à jour les dernières valeurs connues
      lastPosition.current.set(currentPosition.x, currentPosition.y, currentPosition.z);
      lastQuaternion.current.set(currentQuaternion.x, currentQuaternion.y, currentQuaternion.z, currentQuaternion.w);
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