import { useRef, useState, useEffect, useContext, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import VrmAvatar from '../components/VrmAvatar';
import useKeyboardController from './controller/KeyboardController';
import useMouseController from './controller/MouseController';
import usePlayerMovement from '../hooks/usePlayerMovement';
import FollowCamera from './camera/FollowCamera';
import { MODELS, ANIMATIONS } from '../utils/const';
import { MultiplayerContext } from './multiplayer/MultiplayerContext';

export default function Player() {
  const [avatarLoadedRef, setAvatarLoadedRef] = useState(null);
  const avatarObjectRef = useRef(null);

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

  return (
    <>
      <VrmAvatar 
        vrmUrl={MODELS['WomanSkirtCharacter']} 
        idleAnimationUrl={ANIMATIONS['breathing-idle']}
        walkAnimationUrl={ANIMATIONS['walking']}
        runAnimationUrl={ANIMATIONS['run']}
        locomotion={locomotion}
        movementDirection={movementDirection}
        position={[0, -1, 0]} 
        scale={1}
        onLoad={handleAvatarLoad}
        castShadow={true} // Assurez-vous que ceci est bien défini
        receiveShadow={true} // Assurez-vous que ceci est bien défini
      />
      
      {avatarObjectRef.current && <FollowCamera targetRef={avatarObjectRef} angle={cameraAngle} />}
    </>
  );
}