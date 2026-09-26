import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAudioContext } from '../../context/AudioContext';

// TODO: Remplacer par le chemin réel de votre fichier musical
const MUSIC_PATH = '/assets/sfx/BackgroundOST/background.mp3'; 
const BASE_MUSIC_VOLUME = 0.08; // Volume de base de cette musique

export default function BackgroundMusic({ audioListener }) {
  const { globalVolume } = useAudioContext();
  const soundRef = useRef();

  useEffect(() => {
    if (!audioListener) return;

    const sound = new THREE.Audio(audioListener);
    const mediaElement = document.createElement('audio');
    let disposed = false;

    mediaElement.src = MUSIC_PATH;
    mediaElement.loop = true;
    mediaElement.preload = 'metadata';
    mediaElement.playsInline = true;

    sound.setMediaElementSource(mediaElement);
    sound.setVolume(BASE_MUSIC_VOLUME * globalVolume);
    soundRef.current = sound;

    const removeUnlockListeners = () => {
      window.removeEventListener('pointerdown', startPlayback);
      window.removeEventListener('keydown', startPlayback);
      window.removeEventListener('touchend', startPlayback);
    };

    const startPlayback = async () => {
      if (disposed || !mediaElement.paused) return;

      try {
        if (audioListener.context.state === 'suspended') {
          await audioListener.context.resume();
        }
        await mediaElement.play();
        removeUnlockListeners();
      } catch {
        // Les navigateurs mobiles relanceront cette fonction à la prochaine
        // interaction utilisateur autorisée.
      }
    };

    startPlayback();
    window.addEventListener('pointerdown', startPlayback, { passive: true });
    window.addEventListener('keydown', startPlayback);
    window.addEventListener('touchend', startPlayback, { passive: true });

    return () => {
      disposed = true;
      removeUnlockListeners();
      mediaElement.pause();
      mediaElement.removeAttribute('src');
      mediaElement.load();
      sound.disconnect();
      soundRef.current = null;
    };
  }, [audioListener]);

  // Effet séparé pour mettre à jour le volume lorsque globalVolume change
  useEffect(() => {
    if (soundRef.current?.source) {
      soundRef.current.setVolume(BASE_MUSIC_VOLUME * globalVolume);
    }
  }, [globalVolume]);

  // Ce composant n'a pas de rendu visuel
  return null; 
}
