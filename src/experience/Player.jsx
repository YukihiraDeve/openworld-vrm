import { useRef, useState, useEffect, useContext, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import VrmAvatar from '../components/VrmAvatar';
import useKeyboardController from './controller/KeyboardController';
import useMouseController from './controller/MouseController';
import usePlayerMovement from '../hooks/usePlayerMovement';
import FollowCamera from './camera/FollowCamera';
import { MODELS, ANIMATIONS, MODEL_DIRECTION_OFFSETS } from '../utils/const';
import { MultiplayerContext } from './multiplayer/MultiplayerContext';
import { useEmoteContext } from '../context/EmoteContext';
// Variable statique pour suivre si un modèle a déjà été chargé
const modelLoaded = { current: false };

// Chemins vers les sons de pas
// const stepSoundPaths = [...];

export default function Player({ audioListener, stepSoundBuffers, playerPositionRef, paths }) {
  // const { camera } = useThree();
  // const [audioListener, setAudioListener] = useState(null);
  // const [stepSounds, setStepSounds] = useState([]);
  // const stepSoundBuffers = useRef([]);

  const [avatarLoadedRef, setAvatarLoadedRef] = useState(null);
  const avatarObjectRef = useRef(null);
  const initialModelLoggedRef = useRef(false);

  const {
    emitPlayerMove,
    emitPlayerAnimation,
    localPlayerModel
  } = useContext(MultiplayerContext);

  // Système d'émotes
  const {
    currentEmote,
    currentEmoteType,
    toggleEmoteMenu
  } = useEmoteContext();

  const {
    locomotion,
    movementDirection,
    cameraAngle,
    setCameraAngle,
    cameraAngleRef,
    updateMovement,
    updateCameraAngleRef
  } = usePlayerMovement(emitPlayerMove, emitPlayerAnimation, avatarObjectRef);

  const keysPressed = useKeyboardController(cameraAngleRef, () => updateMovement(keysPressed), toggleEmoteMenu);
  useMouseController(setCameraAngle);

  useEffect(() => {
    updateCameraAngleRef();
  }, [cameraAngle, updateCameraAngleRef]);

  const handleAvatarLoad = useCallback((ref) => {
    avatarObjectRef.current = ref;
    setAvatarLoadedRef(ref);
  }, []);

  // Ref pour la lumière directionnelle
  const directionalLightRef = useRef(null);

  // Trouver la lumière une seule fois au montage ou quand la scène change
  useEffect(() => {
    // Option 1: Utiliser la globale définie dans Sky.jsx
    if (window.mainDirectionalLight) {
      directionalLightRef.current = window.mainDirectionalLight;
      return;
    }

    // Option 2: Fallback - Chercher dans la scène (une seule fois)
    if (avatarObjectRef.current) {
      let foundLight = null;
      avatarObjectRef.current.parent?.parent?.traverse((object) => {
        if (object.isDirectionalLight && !foundLight) {
          foundLight = object;
        }
      });
      directionalLightRef.current = foundLight;
    }
  }, []); // Exécuter une seule fois

  useFrame(() => {

    if (avatarObjectRef.current) {
      const playerPosition = new THREE.Vector3();
      avatarObjectRef.current.getWorldPosition(playerPosition);

      // Mettre à jour la position du joueur pour l'optimisation de l'herbe et la physique
      if (playerPositionRef) {
        playerPositionRef.current.copy(playerPosition);
      }

      if (directionalLightRef.current) {
        const light = directionalLightRef.current;

        // Assurer que la target existe
        if (!light.target) {
          light.target = new THREE.Object3D();
          light.parent?.add(light.target);
        }

        // Mettre à jour la target pour qu'elle suive le joueur
        // On évite de recréer des vecteurs ou matrices si possible
        light.target.position.copy(playerPosition);
        light.target.updateMatrixWorld();

        // Mise à jour du frustum de la caméra d'ombre
        if (light.shadow && light.shadow.camera) {
          // Centrer la caméra d'ombre sur le joueur
          // Pas besoin de clone() ici, lookAt accepte x,y,z ou Vector3
          light.shadow.camera.lookAt(playerPosition);
          light.shadow.camera.updateProjectionMatrix();

          // NOTE: autoUpdate est true dans CustomCanvas, donc pas besoin de light.shadow.needsUpdate = true
          // Le forcer peut casser les optimisations internes de Three.js
        }
      }
    }
  });

  // Utiliser le modèle reçu du serveur (localPlayerModel) ou null s'il n'est pas encore arrivé
  const currentModel = localPlayerModel;

  // Obtenir le décalage d'orientation pour le modèle actuel (local)
  const modelDirectionOffset = MODEL_DIRECTION_OFFSETS[currentModel] || 0;

  // Ne rendre l'avatar que si le modèle a été assigné par le serveur
  if (!currentModel) {
    return null; // Ou un composant de chargement
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

      {avatarObjectRef.current && <FollowCamera targetRef={avatarObjectRef} angle={cameraAngle} />}
    </>
  );
}