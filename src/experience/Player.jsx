import { useRef, useState, useEffect, useContext, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import VrmAvatar from '../components/VrmAvatar';
import useKeyboardController from './controller/KeyboardController';
import useMouseController from './controller/MouseController';
import usePlayerMovement from '../hooks/usePlayerMovement';
import FollowCamera from './camera/FollowCamera';
import { MODELS, ANIMATIONS, MODEL_DIRECTION_OFFSETS } from '../utils/const';
import { MultiplayerContext } from './multiplayer/MultiplayerContext';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';

export default function Player() {
  const [avatarLoadedRef, setAvatarLoadedRef] = useState(null);
  const avatarObjectRef = useRef(null);
  
  // Maintenant nous utilisons un état pour le modèle actuel afin de pouvoir le changer
  const [currentModel, setCurrentModel] = useState('Newon');

  const { emitPlayerMove, emitPlayerAnimation } = useContext(MultiplayerContext);

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

  // Gestionnaire de changement de modèle avec les touches numériques
  useEffect(() => {
    const handleModelChange = (event) => {
      // Modèles accessibles avec les touches numériques 1-4
      const modelKeys = Object.keys(MODELS);
      const keyToIndex = {
        '1': 0, // Touche 1 pour le premier modèle
        '2': 1, // Touche 2 pour le deuxième modèle
        '3': 2, // Touche 3 pour le troisième modèle
        '4': 3  // Touche 4 pour le quatrième modèle
      };
      
      const index = keyToIndex[event.key];
      if (index !== undefined && index < modelKeys.length) {
        const newModel = modelKeys[index];
        console.log(`Changement de modèle : ${newModel}`);
        setCurrentModel(newModel);
      }
    };

    window.addEventListener('keydown', handleModelChange);
    return () => window.removeEventListener('keydown', handleModelChange);
  }, []);

  useFrame(() => {
    if (avatarObjectRef.current) {
      // Faire suivre la cible de la lumière au personnage
      const playerPosition = avatarObjectRef.current.position;
      const directionalLights = [];
      
      // Trouver toutes les lumières directionnelles dans la scène
      avatarObjectRef.current.parent.traverse((object) => {
        if (object.isDirectionalLight) {
          directionalLights.push(object);
        }
      });
      
      // Si des lumières sont trouvées, mettre à jour leurs cibles
      if (directionalLights.length > 0) {
        directionalLights.forEach(light => {
          light.target.position.copy(playerPosition);
          light.target.updateMatrixWorld();
        });
      }
    }
  });

  // Obtenir le décalage d'orientation pour le modèle actuel
  const modelDirectionOffset = MODEL_DIRECTION_OFFSETS[currentModel] || 0;

  return (
    <>
    
    <RigidBody colliders={false} type="dynamic" position={[0, 1, 0]}>
      <VrmAvatar 
        key={currentModel} // Ajouter une clé pour forcer la reconstruction du composant quand le modèle change
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
      />
      <CapsuleCollider args={[0.5, 0.9]} position={[0, 1.1, 0]} />
      </RigidBody>
      {avatarObjectRef.current && <FollowCamera targetRef={avatarObjectRef} angle={cameraAngle} />}
      
    </>
  );
}