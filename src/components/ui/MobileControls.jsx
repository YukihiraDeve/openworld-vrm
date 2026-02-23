import React, { useState, useEffect } from 'react';
import { Joystick } from 'react-joystick-component';
import { useControls } from '../../context/ControlsContext';

export default function MobileControls() {
  const { movementJoystickRef, cameraJoystickRef, isMobile } = useControls();
  const [loadingStatus, setLoadingStatus] = useState('');
  
  // PLUS DE DEBUG INFO ICI

  useEffect(() => {
    // On garde l'état loadingStatus pour afficher "Chargement Avatar..."
    // si un avatar se charge ET que ce n'est pas un chargement "silencieux" (le joueur local)
    const onStart = () => setLoadingStatus('Chargement Avatar...');
    const onSuccess = () => setLoadingStatus('');
    const onError = (e) => setLoadingStatus(`Erreur: ${e.detail.error}`);

    window.addEventListener('vrm-loading-start', onStart);
    window.addEventListener('vrm-loading-success', onSuccess);
    window.addEventListener('vrm-loading-error', onError);

    return () => {
        window.removeEventListener('vrm-loading-start', onStart);
        window.removeEventListener('vrm-loading-success', onSuccess);
        window.removeEventListener('vrm-loading-error', onError);
    };
  }, []);

  // Empêcher le comportement par défaut (scroll/zoom) sur iOS
  useEffect(() => {
    if (!isMobile) return;

    const preventDefault = (e) => e.preventDefault();
    document.body.style.touchAction = 'none';
    document.body.style.overflow = 'hidden';
    
    document.addEventListener('gesturestart', preventDefault);
    document.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
        document.body.style.touchAction = '';
        document.body.style.overflow = '';
        document.removeEventListener('gesturestart', preventDefault);
        document.removeEventListener('touchmove', preventDefault);
    };
  }, [isMobile]);

  if (!isMobile) return null;

  const handleMovementMove = (event) => {
    if (movementJoystickRef.current) {
      movementJoystickRef.current = { x: event.x, y: event.y };
      window.dispatchEvent(new CustomEvent('joystick-move'));
    }
  };

  const handleMovementStop = () => {
    if (movementJoystickRef.current) {
      movementJoystickRef.current = { x: 0, y: 0 };
      window.dispatchEvent(new CustomEvent('joystick-move'));
    }
  };

  const handleCameraMove = (event) => {
    if (cameraJoystickRef.current) {
      cameraJoystickRef.current = { x: event.x, y: event.y };
    }
  };

  const handleCameraStop = () => {
    if (cameraJoystickRef.current) {
      cameraJoystickRef.current = { x: 0, y: 0 };
    }
  };

  return (
    <>
        {/* On affiche encore le statut de chargement s'il y en a un (pour le joueur local) */}
        {loadingStatus && (
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'rgba(0,0,0,0.8)',
                color: 'white',
                padding: '20px',
                borderRadius: '10px',
                zIndex: 2000,
                pointerEvents: 'none'
            }}>
                {loadingStatus}
            </div>
        )}

    <div style={{
      position: 'absolute',
      bottom: '30px',
      left: '0',
      width: '100%',
      height: '150px',
      pointerEvents: 'none', // Permet de cliquer à travers la zone vide
      display: 'flex',
      justifyContent: 'space-between',
      padding: '0 40px',
      boxSizing: 'border-box',
      zIndex: 1000
    }}>
      {/* Joystick Gauche - Déplacement */}
      <div style={{ pointerEvents: 'auto' }}>
        <Joystick 
          size={100} 
          sticky={false} 
          baseColor="rgba(255, 255, 255, 0.2)" 
          stickColor="rgba(255, 255, 255, 0.5)"
          move={handleMovementMove} 
          stop={handleMovementStop} 
        />
      </div>

      {/* Joystick Droit - Caméra */}
      <div style={{ pointerEvents: 'auto' }}>
        <Joystick 
          size={100} 
          sticky={false} 
          baseColor="rgba(255, 255, 255, 0.2)" 
          stickColor="rgba(255, 255, 255, 0.5)"
          move={handleCameraMove} 
          stop={handleCameraStop} 
        />
      </div>
    </div>
    </>
  );
}
