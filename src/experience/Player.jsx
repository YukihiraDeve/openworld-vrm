import { useRef, useState, useEffect, useContext, useCallback } from 'react';
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
      />
      
      {avatarObjectRef.current && <FollowCamera targetRef={avatarObjectRef} angle={cameraAngle} />}
    </>
  );
}