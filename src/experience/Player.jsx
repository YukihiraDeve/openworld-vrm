import { useRef, useState, useEffect } from 'react';
import VrmAvatar from '../components/VrmAvatar';
import useKeyboardController from './controller/KeyboardController';
import useMouseController from './controller/MouseController';
import usePlayerMovement from '../hooks/usePlayerMovement';
import FollowCamera from './camera/FollowCamera';
import { MODELS, ANIMATIONS } from '../utils/const';

export default function Player() {
  const [avatarRef, setAvatarRef] = useState(null);
  const {
    locomotion,
    movementDirection,
    cameraAngle,
    setCameraAngle,
    cameraAngleRef,
    updateMovement,
    updateCameraAngleRef
  } = usePlayerMovement();

  const keysPressed = useKeyboardController(cameraAngleRef, () => updateMovement(keysPressed));
  useMouseController(setCameraAngle);

  // Mise à jour de la ref quand l'angle change
  useEffect(() => {
    updateCameraAngleRef();
  }, [cameraAngle, updateCameraAngleRef]);

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
        onLoad={setAvatarRef}
      />
      
      {avatarRef && <FollowCamera targetRef={avatarRef} angle={cameraAngle} />}
    </>
  );
}