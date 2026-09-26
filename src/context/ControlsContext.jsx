import React, { createContext, useContext, useMemo, useState, useRef } from 'react';

const ControlsContext = createContext();

export function useControls() {
  return useContext(ControlsContext);
}

export function ControlsProvider({ children }) {
  // On utilise des refs pour les valeurs qui changent très souvent (chaque frame)
  // pour éviter de re-render tout l'arbre React à chaque micro-mouvement de joystick.
  const movementJoystickRef = useRef({ x: 0, y: 0 });
  const cameraJoystickRef = useRef({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false); // Pourrait être détecté automatiquement

  React.useEffect(() => {
    const checkMobile = () => {
      const userAgent = typeof window.navigator === "undefined" ? "" : navigator.userAgent;
      const hasMobileUserAgent = Boolean(
        userAgent.match(
          /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i
        )
      );
      const hasTouchScreen = navigator.maxTouchPoints > 0;
      const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
      setIsMobile(hasMobileUserAgent || (hasTouchScreen && hasCoarsePointer));
    };
    checkMobile();
  }, []);

  const value = useMemo(() => ({
    movementJoystickRef,
    cameraJoystickRef,
    isMobile,
  }), [isMobile]);

  return (
    <ControlsContext.Provider value={value}>
      {children}
    </ControlsContext.Provider>
  );
}
