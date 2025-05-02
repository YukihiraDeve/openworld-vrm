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
    // Attendre que l'audioListener soit prêt
    if (!audioListener) {
      console.log("BackgroundMusic: En attente de l'AudioListener...");
      return;
    }
    
    console.log("BackgroundMusic: AudioListener reçu, création du son.");
    // Utiliser THREE.Audio pour un son non spatialisé (attaché à l'écouteur)
    const sound = new THREE.Audio(audioListener);
    soundRef.current = sound; 

    const audioLoader = new THREE.AudioLoader();
    audioLoader.load(
      MUSIC_PATH,
      (buffer) => {
        // Vérifier si le composant est toujours monté avant de configurer le son
        if (!soundRef.current) {
            console.log("BackgroundMusic: Composant démonté pendant le chargement.");
            return; 
        }
        soundRef.current.setBuffer(buffer);
        soundRef.current.setLoop(true);
        // Appliquer le volume initial basé sur le contexte
        soundRef.current.setVolume(BASE_MUSIC_VOLUME * globalVolume);
        
        // Essayer de jouer seulement si le contexte audio est débloqué (interaction utilisateur)
        // Cela peut nécessiter une interaction utilisateur initiale pour démarrer l'audio dans certains navigateurs.
        try {
            soundRef.current.play();
            console.log(`Musique de fond chargée et lancée: ${MUSIC_PATH}`);
        } catch (error) {
            console.error("BackgroundMusic: Erreur lors de la tentative de lecture automatique. Une interaction utilisateur peut être nécessaire.", error);
            // On pourrait mettre en place un bouton "Démarrer l'audio" si la lecture échoue.
        }
      },
      undefined, // onProgress non utilisé ici
      (err) => {
        console.error(`BackgroundMusic: Erreur de chargement de la musique de fond ${MUSIC_PATH}:`, err);
      }
    );

    // Fonction de nettoyage pour arrêter la musique lors du démontage
    return () => {
      if (soundRef.current && soundRef.current.isPlaying) {
        console.log("BackgroundMusic: Arrêt de la musique de fond.");
        soundRef.current.stop();
      }
      // On détache aussi le son de l'écouteur pour être propre, bien que Three.js puisse le gérer
      if (soundRef.current && audioListener && soundRef.current.parent === audioListener) {
          audioListener.remove(soundRef.current);
      }
      soundRef.current = null; // Effacer la référence
      console.log("BackgroundMusic: Nettoyage effectué.");
    };
  }, [audioListener]); // L'effet dépend de l'audioListener

  // Effet séparé pour mettre à jour le volume lorsque globalVolume change
  useEffect(() => {
    if (soundRef.current && soundRef.current.source) { // Vérifier si le son est prêt
      soundRef.current.setVolume(BASE_MUSIC_VOLUME * globalVolume);
    }
  }, [globalVolume]);

  // Ce composant n'a pas de rendu visuel
  return null; 
} 