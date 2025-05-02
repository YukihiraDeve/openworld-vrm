import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioContext } from '../../context/AudioContext';

// Constantes pour les intervalles de pas (identiques à celles de VrmAvatar/usePlayerMovement)
const WALK_STEP_INTERVAL = 0.5;
const RUN_STEP_INTERVAL = 0.3;
const BASE_FOOTSTEP_VOLUME = 0.5; // Volume de base pour les pas

export default function FootstepAudio({ 
  audioListener, 
  stepSoundBuffers, // Ref vers les buffers chargés
  targetRef,       // Ref vers l'Object3D auquel attacher les sons
  locomotion       // État de mouvement actuel ('idle', 'walk', 'run')
}) {
  const { globalVolume } = useAudioContext();
  const soundsRef = useRef([]); // Stocker les instances PositionalAudio
  const lastStepTime = useRef(0);

  // Effet pour créer/nettoyer les sons PositionalAudio
  useEffect(() => {
    if (
      targetRef?.current && 
      audioListener && 
      stepSoundBuffers?.current?.length > 0 && 
      soundsRef.current.length === 0
    ) {
      const targetObject = targetRef.current;
      
      const sounds = stepSoundBuffers.current.map(buffer => {
        const sound = new THREE.PositionalAudio(audioListener);
        sound.setBuffer(buffer);
        sound.setRefDistance(1); 
        sound.setRolloffFactor(1); 
        // Appliquer le volume initial basé sur le contexte
        sound.setVolume(BASE_FOOTSTEP_VOLUME * globalVolume);
        targetObject.add(sound);
        return sound;
      });
      soundsRef.current = sounds;
      console.log(`FootstepAudio: PositionalAudio créé et attaché à ${targetObject.uuid}`);
    }

    return () => {
      if (soundsRef.current.length > 0) {
        const targetObject = targetRef?.current;
        console.log(`FootstepAudio: Nettoyage pour ${targetObject?.uuid}`);
        soundsRef.current.forEach(sound => {
          if (sound.isPlaying) {
            sound.stop();
          }
          if (targetObject && sound.parent === targetObject) {
            targetObject.remove(sound);
          }
        });
        soundsRef.current = [];
      }
    };
  }, [targetRef?.current, audioListener, stepSoundBuffers?.current]);

  // Effet séparé pour mettre à jour le volume lorsque globalVolume change
  useEffect(() => {
    soundsRef.current.forEach(sound => {
      if (sound.source) { // Vérifier si le son est prêt
        sound.setVolume(BASE_FOOTSTEP_VOLUME * globalVolume);
      }
    });
  }, [globalVolume]);

  // useFrame pour gérer la lecture des sons
  useFrame((state) => {
    if (soundsRef.current.length === 0 || locomotion === 'idle') {
      return;
    }

    if (locomotion === 'walk' || locomotion === 'run') {
      const currentTime = state.clock.elapsedTime;
      const interval = locomotion === 'run' ? RUN_STEP_INTERVAL : WALK_STEP_INTERVAL;

      if (currentTime - lastStepTime.current >= interval) {
        const randomIndex = Math.floor(Math.random() * soundsRef.current.length);
        const soundToPlay = soundsRef.current[randomIndex];
        
        if (soundToPlay && !soundToPlay.isPlaying) {
          if (targetRef?.current && soundToPlay.parent === targetRef.current) {
            // Le volume est déjà réglé par l'effet sur globalVolume
            soundToPlay.play();
          } else {
              console.warn("FootstepAudio: Tentative de jouer un son non attaché.");
          }
        }
        lastStepTime.current = currentTime;
      }
    }
  });

  return null;
} 