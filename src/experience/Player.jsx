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
// Variable statique pour suivre si un modèle a déjà été chargé
const modelLoaded = { current: false };

// Chemins vers les sons de pas
// const stepSoundPaths = [...];

export default function Player({ audioListener, stepSoundBuffers }) {
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

  const {
    locomotion,
    movementDirection,
    cameraAngle,
    setCameraAngle,
    cameraAngleRef,
    updateMovement,
    updateCameraAngleRef
  } = usePlayerMovement(emitPlayerMove, emitPlayerAnimation, avatarObjectRef);

  const keysPressed = useKeyboardController(cameraAngleRef, () => updateMovement(keysPressed));
  useMouseController(setCameraAngle);

  useEffect(() => {
    updateCameraAngleRef();
  }, [cameraAngle, updateCameraAngleRef]);

  const handleAvatarLoad = useCallback((ref) => {
    avatarObjectRef.current = ref;
    setAvatarLoadedRef(ref);
  }, []);

  useFrame(() => {
    if (avatarObjectRef.current) {
      const playerPosition = avatarObjectRef.current.position;
      const directionalLights = [];
      
      // Recherche plus large des lumières dans la scène
      avatarObjectRef.current.parent.parent.traverse((object) => {
        if (object.isDirectionalLight) {
          directionalLights.push(object);
        }
      });
      
      if (directionalLights.length > 0) {
        directionalLights.forEach(light => {
          // Assurer que la target existe
          if (!light.target) {
            light.target = new THREE.Object3D();
            light.parent.add(light.target);
          }
          
          // Mettre à jour la target pour qu'elle suive le joueur
          light.target.position.copy(playerPosition);
          light.target.updateMatrixWorld();
          
          // Mise à jour du frustum de la caméra d'ombre
          if (light.shadow && light.shadow.camera) {
            // Centrer la caméra d'ombre sur le joueur
            const shadowCameraTarget = playerPosition.clone();
            light.shadow.camera.lookAt(shadowCameraTarget);
            light.shadow.camera.updateProjectionMatrix();
            light.shadow.needsUpdate = true;
          }
        });
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
      />    
      
      {avatarObjectRef.current && <FollowCamera targetRef={avatarObjectRef} angle={cameraAngle} />}
      
    </>
  );
}