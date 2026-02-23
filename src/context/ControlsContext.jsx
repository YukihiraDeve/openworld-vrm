import React, { createContext, useContext, useState, useRef } from 'react';

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

  // Détection basique du mobile (optionnel, peut être forcé pour le test)
  React.useEffect(() => {
    const checkMobile = () => {
      const userAgent = typeof window.navigator === "undefined" ? "" : navigator.userAgent;
      const mobile = Boolean(
        userAgent.match(
          /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i
        )
      );
      // On peut aussi activer par défaut pour le développement si on veut tester sur desktop
      // setIsMobile(mobile);
      setIsMobile(true); // FORCÉ À TRUE POUR QUE TU PUISSES TESTER
    };
    checkMobile();
  }, []);

  return (
    <ControlsContext.Provider value={{
      movementJoystickRef,
      cameraJoystickRef,
      isMobile
    }}>
      {children}
    </ControlsContext.Provider>
  );
}

