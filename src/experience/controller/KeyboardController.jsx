import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function useKeyboardController(cameraAngleRef, updateMovement) {
  const keysPressed = useRef({
    KeyW: false, 
    KeyA: false, 
    KeyS: false, 
    KeyD: false,
    ShiftLeft: false, 
    ShiftRight: false, 
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
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

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updateMovement]);

  return keysPressed;
}
