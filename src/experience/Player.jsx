import { useRef, useState, useEffect, useContext, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import VrmAvatar from '../components/VrmAvatar';
import useKeyboardController from './controller/KeyboardController';
import useMouseController from './controller/MouseController';
import usePlayerMovement from '../hooks/usePlayerMovement';
import FollowCamera from './camera/FollowCamera';
import { MODELS, ANIMATIONS, MODEL_DIRECTION_OFFSETS } from '../utils/const';
import { MultiplayerActionsContext } from './multiplayer/MultiplayerContext';
import { useEmoteContext } from '../context/EmoteContext';
import { useControls } from '../context/ControlsContext';

const playerWorldPosition = new THREE.Vector3();

// Chemins vers les sons de pas
// const stepSoundPaths = [...];

export default function Player({ audioListener, stepSoundBuffers, playerPositionRef, paths }) {
  // const { camera } = useThree();
  // const [audioListener, setAudioListener] = useState(null);
  // const [stepSounds, setStepSounds] = useState([]);
  // const stepSoundBuffers = useRef([]);

  const [, setAvatarLoadedRef] = useState(null);
  const avatarObjectRef = useRef(null);
  const initialModelLoggedRef = useRef(false);

  const {
    emitPlayerMove,
    emitPlayerAnimation,
    localPlayerModel
  } = useContext(MultiplayerActionsContext);

  // Système d'émotes
  const {
    currentEmote,
    currentEmoteType,
    toggleEmoteMenu
  } = useEmoteContext();

  const { cameraJoystickRef } = useControls();

  const {
    locomotion,
    movementDirection,
    setCameraAngle,
    cameraAngleRef,
    updateMovement,
  } = usePlayerMovement(emitPlayerMove, emitPlayerAnimation, avatarObjectRef);

  const keysPressed = useKeyboardController(cameraAngleRef, () => updateMovement(keysPressed), toggleEmoteMenu);
  useMouseController(setCameraAngle);

  // Écouter les événements du joystick de mouvement
  useEffect(() => {
    const handleJoystickMove = () => {
      // On passe keysPressed pour ne pas perdre l'état du clavier si utilisé en même temps
      updateMovement(keysPressed);
    };
    window.addEventListener('joystick-move', handleJoystickMove);
    return () => window.removeEventListener('joystick-move', handleJoystickMove);
  }, [updateMovement, keysPressed]);

  const handleAvatarLoad = useCallback((ref) => {
    avatarObjectRef.current = ref;
    setAvatarLoadedRef(ref);
  }, []);

  useFrame((_, delta) => {
    // Gestion du Joystick Caméra (Droit)
    if (cameraJoystickRef.current) {
      const { x, y } = cameraJoystickRef.current;
      if (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) {
        const angle = cameraAngleRef.current;
        angle.horizontal -= x * 2.0 * delta;
        angle.vertical = THREE.MathUtils.clamp(
          angle.vertical + y * 2.0 * delta,
          0.1,
          Math.PI / 2 - 0.1,
        );
      }
    }

    if (avatarObjectRef.current) {
      avatarObjectRef.current.getWorldPosition(playerWorldPosition);

      // Mettre à jour la position du joueur pour l'optimisation de l'herbe et la physique
      if (playerPositionRef) {
        playerPositionRef.current.copy(playerWorldPosition);
      }
    }
  });

  // Utiliser le modèle reçu du serveur (localPlayerModel) ou null s'il n'est pas encore arrivé
  const currentModel = localPlayerModel;

  // Obtenir le décalage d'orientation pour le modèle actuel (local)
  const modelDirectionOffset = MODEL_DIRECTION_OFFSETS[currentModel] || 0;

  // Ne rendre l'avatar que si le modèle a été assigné par le serveur
  if (!currentModel) {
    return null;
  }

  return (
    <>
      <VrmAvatar
        key={currentModel}
        vrmUrl={MODELS[currentModel]}
        idleAnimationUrl={ANIMATIONS['breathing-idle']}
        walkAnimationUrl={ANIMATIONS['walking']}
        runAnimationUrl={ANIMATIONS['run']}
        locomotion={locomotion}
        movementDirection={movementDirection}
        scale={1}
        onLoad={handleAvatarLoad}
        castShadow={true}
        receiveShadow={true}
        capsuleCollider={true}
        modelDirectionOffset={modelDirectionOffset}
        position={[0, 2, 0]}
        audioListener={audioListener}
        stepSoundBuffers={stepSoundBuffers}
        currentEmote={currentEmote}
        currentEmoteType={currentEmoteType}
        emoteAnimationUrl={currentEmoteType === 'animation' && currentEmote ? ANIMATIONS[currentEmote] : null}
        emoteExpression={currentEmoteType === 'expression' ? currentEmote : null}
        paths={paths}
      />

      {avatarObjectRef.current && (
        <FollowCamera targetRef={avatarObjectRef} angleRef={cameraAngleRef} locomotion={locomotion} />
      )}
    </>
  );
}
