import { useEffect, useRef } from 'react';

const KEY_ALIASES = {
  ArrowUp: 'KeyW',
  ArrowLeft: 'KeyA',
  ArrowDown: 'KeyS',
  ArrowRight: 'KeyD',
};

export default function useKeyboardController(cameraAngleRef, updateMovement, onEmoteMenuToggle) {
  const keysPressed = useRef({
    KeyW: false, 
    KeyA: false, 
    KeyS: false, 
    KeyD: false,
    ShiftLeft: false, 
    ShiftRight: false, 
    Space: false,
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.repeat) return;
      
      // Gestion de la touche B pour ouvrir le menu d'émotes
      if (event.code === 'KeyB' && onEmoteMenuToggle) {
        onEmoteMenuToggle();
        return;
      }
      
      const code = KEY_ALIASES[event.code] ?? event.code;
      if (code in keysPressed.current) {
        if (code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
        keysPressed.current[code] = true;
        updateMovement();
      }
    };

    const handleKeyUp = (event) => {
      const code = KEY_ALIASES[event.code] ?? event.code;
      if (code in keysPressed.current) {
        keysPressed.current[code] = false;
        updateMovement();
      }
    };

    // Les keyup sont perdus quand la fenêtre perd le focus : sans ça, le personnage continue d'avancer
    const releaseAllKeys = () => {
      const keys = keysPressed.current;
      let changed = false;
      for (const code in keys) {
        if (keys[code]) {
          keys[code] = false;
          changed = true;
        }
      }
      if (changed) updateMovement();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) releaseAllKeys();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseAllKeys);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAllKeys);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updateMovement, onEmoteMenuToggle]);

  return keysPressed;
}
