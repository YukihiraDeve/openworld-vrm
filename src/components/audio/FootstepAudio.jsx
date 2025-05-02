import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Constantes pour les intervalles de pas (identiques à celles de VrmAvatar/usePlayerMovement)
const WALK_STEP_INTERVAL = 0.5;
const RUN_STEP_INTERVAL = 0.3;

export default function FootstepAudio({ 
  audioListener, 
  stepSoundBuffers, // Ref vers les buffers chargés
  targetRef,       // Ref vers l'Object3D auquel attacher les sons
  locomotion       // État de mouvement actuel ('idle', 'walk', 'run')
}) {
  const soundsRef = useRef([]); // Stocker les instances PositionalAudio
  const lastStepTime = useRef(0);

  // Effet pour créer/nettoyer les sons PositionalAudio
  useEffect(() => {
    // Vérifier si toutes les dépendances nécessaires sont prêtes
    if (
      targetRef?.current && 
      audioListener && 
      stepSoundBuffers?.current?.length > 0 && 
      soundsRef.current.length === 0 // Créer seulement si pas déjà fait
    ) {
      const targetObject = targetRef.current; // L'objet 3D (le groupe de l'avatar)
      
      const sounds = stepSoundBuffers.current.map(buffer => {
        const sound = new THREE.PositionalAudio(audioListener);
        sound.setBuffer(buffer);
        sound.setRefDistance(1); // Ajuster selon vos besoins
        sound.setRolloffFactor(1); // Ajuster selon vos besoins
        sound.setVolume(0.5); // Ajuster le volume initial
        targetObject.add(sound); // Attacher le son à l'objet cible
        return sound;
      });
      soundsRef.current = sounds;
      console.log(`FootstepAudio: PositionalAudio créé et attaché à ${targetObject.uuid}`);
    }

    // Nettoyage lorsque le composant est démonté ou les dépendances changent
    return () => {
      if (soundsRef.current.length > 0) {
        const targetObject = targetRef?.current; // Récupérer la référence actuelle pour le nettoyage
        console.log(`FootstepAudio: Nettoyage pour ${targetObject?.uuid}`);
        soundsRef.current.forEach(sound => {
          if (sound.isPlaying) {
            sound.stop();
          }
          // Vérifier si le parent existe et correspond avant de retirer
          if (targetObject && sound.parent === targetObject) {
            targetObject.remove(sound);
          }
        });
        soundsRef.current = []; // Vider le tableau
      }
    };
  // Dépendances : recréer/nettoyer si l'une d'elles change (surtout targetRef.current)
  }, [targetRef?.current, audioListener, stepSoundBuffers?.current]);

  // useFrame pour gérer la lecture des sons en fonction de la locomotion
  useFrame((state) => {
    // Ne rien faire si pas de sons ou si immobile
    if (soundsRef.current.length === 0 || locomotion === 'idle') {
      return;
    }

    // Jouer le son si en mouvement (walk/run) et si l'intervalle est dépassé
    if (locomotion === 'walk' || locomotion === 'run') {
      const currentTime = state.clock.elapsedTime;
      const interval = locomotion === 'run' ? RUN_STEP_INTERVAL : WALK_STEP_INTERVAL;

      if (currentTime - lastStepTime.current >= interval) {
        const randomIndex = Math.floor(Math.random() * soundsRef.current.length);
        const soundToPlay = soundsRef.current[randomIndex];
        
        if (soundToPlay && !soundToPlay.isPlaying) {
          // Assurer que le son est toujours attaché avant de jouer
          if (targetRef?.current && soundToPlay.parent === targetRef.current) {
            soundToPlay.play();
             // Optionnel : ajuster le pitch
             // soundToPlay.setPlaybackRate(1 + Math.random() * 0.2 - 0.1);
          } else {
              console.warn("FootstepAudio: Tentative de jouer un son non attaché.");
          }
        }
        lastStepTime.current = currentTime;
      }
    }
  });

  // Ce composant ne rend rien visuellement
  return null;
} 