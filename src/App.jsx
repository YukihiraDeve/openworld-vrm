import React, { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Plane } from '@react-three/drei';
import VrmAvatar from './components/VrmAvatar';
import * as THREE from 'three';

import { MODELS, ANIMATIONS } from './const';

function App() {
  // ✨ État pour les touches pressées
  const keysPressed = useRef({
    KeyW: false, 
    KeyA: false, 
    KeyS: false, 
    KeyD: false,
    ShiftLeft: false, 
    ShiftRight: false, 
  });

  // ✨ État pour l'action/locomotion actuelle de l'avatar
  const [locomotion, setLocomotion] = useState('idle'); // Renommé pour clarté
  // ✨ État pour la direction du mouvement
  const [movementDirection, setMovementDirection] = useState(new THREE.Vector3(0, 0, 0));
  // ✨ État pour stocker la référence de l'avatar
  const [avatarRef, setAvatarRef] = useState(null);
  // ✨ États pour la rotation de la caméra contrôlée par la souris
  const [cameraAngle, setCameraAngle] = useState({ horizontal: 0, vertical: Math.PI / 8 }); // Angle initial
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  // ✨ Ref pour stocker l'angle de la caméra pour les key listeners
  const cameraAngleRef = useRef(cameraAngle);

  // ✨ Gestion des événements clavier
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ignorer les répétitions si la touche est déjà enfoncée (utile pour Shift)
      if (event.repeat) return;
      if (event.code in keysPressed.current) {
        keysPressed.current[event.code] = true;
        updateMovement();
      }
    };

    const handleKeyUp = (event) => {
      if (event.code in keysPressed.current) {
        keysPressed.current[event.code] = false;
        updateMovement();
      }
    };

    // ✨ Fonction pour mettre à jour la direction et l'état de locomotion
    const updateMovement = () => {
      // ✨ Lire l'angle horizontal actuel de la caméra depuis la ref
      const horizontalAngle = cameraAngleRef.current.horizontal;

      // ✨ Calculer les vecteurs avant et droite de la caméra (sur le plan XZ)
      const cameraForward = new THREE.Vector3(-Math.sin(horizontalAngle), 0, -Math.cos(horizontalAngle));
      const cameraRight = new THREE.Vector3(Math.cos(horizontalAngle), 0, -Math.sin(horizontalAngle));

      const finalMoveDirection = new THREE.Vector3(0, 0, 0);
      let isMoving = false;
      const isRunning = keysPressed.current.ShiftLeft || keysPressed.current.ShiftRight;

      if (keysPressed.current.KeyW) { // Avant (relatif caméra)
        finalMoveDirection.add(cameraForward);
        isMoving = true;
      }
      if (keysPressed.current.KeyS) { // Arrière (relatif caméra)
        finalMoveDirection.sub(cameraForward);
        isMoving = true;
      }
      if (keysPressed.current.KeyA) { // Gauche (relatif caméra)
        finalMoveDirection.sub(cameraRight);
        isMoving = true;
      }
      if (keysPressed.current.KeyD) { // Droite (relatif caméra)
        finalMoveDirection.add(cameraRight);
        isMoving = true;
      }

      // Normaliser la direction si nécessaire
      if (finalMoveDirection.lengthSq() > 0) {
        finalMoveDirection.normalize();
      }

      setMovementDirection(finalMoveDirection);
      // Déterminer l'état de locomotion
      if (isMoving) {
        setLocomotion(isRunning ? 'run' : 'walk');
      } else {
        setLocomotion('idle');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []); // Exécuter une seule fois au montage

  // ✨ Mettre à jour la ref de l'angle caméra quand l'état change
  useEffect(() => {
    cameraAngleRef.current = cameraAngle;
  }, [cameraAngle]);

  // ✨ Gestion des événements souris pour la caméra
  useEffect(() => {
    const handleMouseDown = (event) => {
      if (event.button === 0) { // Bouton gauche
        isDragging.current = true;
        previousMousePosition.current = { x: event.clientX, y: event.clientY };
        // Optionnel: Changer le curseur pour indiquer le drag
        document.body.style.cursor = 'grabbing'; 
      }
    };

    const handleMouseUp = (event) => {
      if (event.button === 0) {
        isDragging.current = false;
        // Optionnel: Rétablir le curseur par défaut
        document.body.style.cursor = 'default'; 
      }
    };

    const handleMouseMove = (event) => {
      if (!isDragging.current) return;

      const deltaX = event.clientX - previousMousePosition.current.x;
      const deltaY = event.clientY - previousMousePosition.current.y;

      setCameraAngle(prevAngle => {
        const horizontal = prevAngle.horizontal - deltaX * 0.005; // Ajuster sensibilité
        let vertical = prevAngle.vertical - deltaY * 0.005;   // Ajuster sensibilité

        // Limiter l'angle vertical pour éviter de passer par dessus/dessous
        vertical = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, vertical));

        return { horizontal, vertical };
      });

      previousMousePosition.current = { x: event.clientX, y: event.clientY };
    };

    // Ajouter les écouteurs au canvas ou à un élément parent
    const canvasElement = document.querySelector('canvas'); // Cible le canvas Three.js
    if (canvasElement) {
        canvasElement.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp); // Écouteur global pour mouseup
        window.addEventListener('mousemove', handleMouseMove); // Écouteur global pour mousemove
    }

    return () => {
      if (canvasElement) {
        canvasElement.removeEventListener('mousedown', handleMouseDown);
      }
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', handleMouseMove);
        // Rétablir le curseur si on démonte le composant en cours de drag
        document.body.style.cursor = 'default'; 
    };
  }, []); // Exécuter une seule fois au montage

  // ✨ Nouveau composant pour gérer la caméra
  const CameraUpdater = ({ targetRef, angle }) => {
    const { camera } = useThree();
    const cameraDistance = 5; // Distance fixe de la caméra
    const lookAtOffset = useMemo(() => new THREE.Vector3(0, 1, 0), []);

    useFrame(() => {
      if (targetRef && targetRef.current) {
        const targetPosition = new THREE.Vector3();
        targetRef.current.getWorldPosition(targetPosition);

        // Calcule la position souhaitée de la caméra en utilisant les angles
        const desiredCameraPosition = new THREE.Vector3();
        desiredCameraPosition.x = targetPosition.x + cameraDistance * Math.sin(angle.horizontal) * Math.cos(angle.vertical);
        desiredCameraPosition.y = targetPosition.y + cameraDistance * Math.sin(angle.vertical) + lookAtOffset.y; // Ajuster la hauteur basé sur l'angle vertical et l'offset
        desiredCameraPosition.z = targetPosition.z + cameraDistance * Math.cos(angle.horizontal) * Math.cos(angle.vertical);

        // Interpolation douce pour la position de la caméra
        camera.position.lerp(desiredCameraPosition, 0.1);

        // Calcule le point que la caméra doit regarder
        const lookAtPosition = targetPosition.clone().add(lookAtOffset);
        // Fait regarder la caméra vers le point cible
        camera.lookAt(lookAtPosition);
      }
    });

    return null;
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 1, 5], fov: 50 }}
        background={new THREE.Color("#FF0000")}
        shadows
      >
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />

        <Plane
          args={[20, 20]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -1, 0]}
          receiveShadow
        >
          <meshStandardMaterial color="#ffffff" />
        </Plane>

        <Suspense fallback={null}>

          <VrmAvatar 
            vrmUrl={MODELS['WomanSkirtCharacter']} 
            idleAnimationUrl={ANIMATIONS['breathing-idle']}
            walkAnimationUrl={ANIMATIONS['walking']}
            runAnimationUrl={ANIMATIONS['run']}
            locomotion={locomotion}
            movementDirection={movementDirection}
            position={[0, -1, 0]} 
            scale={1}
            onLoad={setAvatarRef}
          />

          <Environment preset="sunset" />
        </Suspense>

        {avatarRef && <CameraUpdater targetRef={avatarRef} angle={cameraAngle} />}

      </Canvas>
    </div>
  );
}

export default App;
