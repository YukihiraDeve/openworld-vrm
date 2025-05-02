import React, { createContext, useState, useContext, useCallback } from 'react';

const AudioContext = createContext();

export const useAudioContext = () => useContext(AudioContext);

export const AudioProvider = ({ children }) => {
  const [globalVolume, setGlobalVolume] = useState(1.0); // Volume global initial (1 = 100%)

  // Fonction pour changer le volume, avec useCallback pour la performance
  const changeGlobalVolume = useCallback((newVolume) => {
    const clampedVolume = Math.max(0, Math.min(1, parseFloat(newVolume))); // Assure que le volume est entre 0 et 1
    setGlobalVolume(clampedVolume);
    console.log("Global volume set to:", clampedVolume);
  }, []);

  const value = {
    globalVolume,
    setGlobalVolume: changeGlobalVolume, // Exposer la fonction de mise à jour
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}; 