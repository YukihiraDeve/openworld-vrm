import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useControls } from '../context/ControlsContext';

// Intervalles pour les bruits de pas (en secondes)
// Supprimer ces constantes d'ici, elles sont dans FootstepAudio
// const WALK_STEP_INTERVAL = 0.5;
// const RUN_STEP_INTERVAL = 0.3;

export default function usePlayerMovement(emitPlayerMove, emitPlayerAnimation, avatarRef) {
  const { movementJoystickRef } = useControls();
  const [locomotion, setLocomotion] = useState('idle');
  const [mobileJumpTriggered, setMobileJumpTriggered] = useState(false);

  // Écouter le saut mobile
  useEffect(() => {
    const handleMobileJump = () => {
        setMobileJumpTriggered(true);
        // Reset après une frame ou court délai pour éviter les sauts multiples infinis
        setTimeout(() => setMobileJumpTriggered(false), 100);
    };
    window.addEventListener('mobile-jump', handleMobileJump);
    return () => window.removeEventListener('mobile-jump', handleMobileJump);
  }, []);
  const [movementDirection, setMovementDirection] = useState(new THREE.Vector3(0, 0, 0));
  const [cameraAngle, setCameraAngle] = useState({ horizontal: 0, vertical: Math.PI / 8 });
  const cameraAngleRef = useRef(cameraAngle);

  const lastPosition = useRef(new THREE.Vector3());
  const lastQuaternion = useRef(new THREE.Quaternion());
  const lastLocomotion = useRef(locomotion);
  const debugUpdateCounter = useRef(0);

  const updateMovement = useCallback((keysPressed) => {
    const horizontalAngle = cameraAngleRef.current.horizontal;

    const cameraForward = new THREE.Vector3(-Math.sin(horizontalAngle), 0, -Math.cos(horizontalAngle));
    const cameraRight = new THREE.Vector3(Math.cos(horizontalAngle), 0, -Math.sin(horizontalAngle));

    const finalMoveDirection = new THREE.Vector3(0, 0, 0);
    let isMoving = false;
    // Vérification de sécurité pour keysPressed
    const safeKeys = keysPressed && keysPressed.current ? keysPressed.current : {};
    
    const isRunning = safeKeys.ShiftLeft || safeKeys.ShiftRight;
    const isJumping = safeKeys.Space || mobileJumpTriggered;

    if (safeKeys.KeyW) {
      finalMoveDirection.add(cameraForward);
      isMoving = true;
    }
    if (safeKeys.KeyS) {
      finalMoveDirection.sub(cameraForward);
      isMoving = true;
    }
    if (safeKeys.KeyA) {
      finalMoveDirection.sub(cameraRight);
      isMoving = true;
    }
    if (safeKeys.KeyD) {
      finalMoveDirection.add(cameraRight);
      isMoving = true;
    }

    // Gestion du Joystick
    if (movementJoystickRef && movementJoystickRef.current) {
        const { x, y } = movementJoystickRef.current;
        // x = gauche/droite (-1 à 1)
        // y = bas/haut (-1 à 1) -> y positif = avant
        
        // LOG DEBUG JOYSTICK
        if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) {
             // console.log("Joystick Input détecté:", x, y);
             
            // Y positif = avancer (ajouter cameraForward)
            if (Math.abs(y) > 0.1) finalMoveDirection.add(cameraForward.clone().multiplyScalar(y));
            // X positif = droite (ajouter cameraRight)
            if (Math.abs(x) > 0.1) finalMoveDirection.add(cameraRight.clone().multiplyScalar(x));
            
            isMoving = true;
        }
    }

    if (finalMoveDirection.lengthSq() > 0) {
      finalMoveDirection.normalize();
      // Émettre un event de debug pour l'afficher sur l'UI mobile
      if (movementJoystickRef && movementJoystickRef.current && (Math.abs(movementJoystickRef.current.x) > 0.1 || Math.abs(movementJoystickRef.current.y) > 0.1)) {
           window.dispatchEvent(new CustomEvent('debug-log', { 
               detail: `Dir: X${finalMoveDirection.x.toFixed(2)} Z${finalMoveDirection.z.toFixed(2)}` 
           }));
      }
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

  useFrame((state, delta) => {
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
      
        return;
    }
    
     // Convertir la position Vector3 en objet simple {x, y, z}
    const currentPosition = {
        x: currentPositionVec.x,
        y: currentPositionVec.y,
        z: currentPositionVec.z
    };

    // DEBUG: Émettre la position pour l'UI mobile (1 fois sur 10 frames pour ne pas surcharger)
    debugUpdateCounter.current++;
    if (debugUpdateCounter.current % 10 === 0) {
        window.dispatchEvent(new CustomEvent('debug-pos', { detail: currentPosition }));
    }

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