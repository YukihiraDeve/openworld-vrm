import { useCallback, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioContext } from '../../context/AudioContext';

const WALK_STEP_INTERVAL = 0.5;
const RUN_STEP_INTERVAL = 0.3;
const BASE_FOOTSTEP_VOLUME = 0.5;
const FOOTSTEP_VOICE_COUNT = 2;

export default function FootstepAudio({
  audioListener,
  stepSoundBuffers,
  targetRef,
  locomotion,
}) {
  const { globalVolume } = useAudioContext();
  const soundPoolRef = useRef([]);
  const lastStepTime = useRef(0);
  const nextVoiceRef = useRef(0);
  const volumeRef = useRef(globalVolume);

  const ensureSoundPool = useCallback(() => {
    if (soundPoolRef.current.length > 0) return soundPoolRef.current;
    if (
      !targetRef?.current ||
      !audioListener ||
      !stepSoundBuffers?.current?.length
    ) {
      return null;
    }

    const target = targetRef.current;
    for (let index = 0; index < FOOTSTEP_VOICE_COUNT; index += 1) {
      const sound = new THREE.PositionalAudio(audioListener);
      sound.setRefDistance(1);
      sound.setRolloffFactor(1);
      sound.setDistanceModel('inverse');
      sound.setVolume(BASE_FOOTSTEP_VOLUME * volumeRef.current);
      target.add(sound);
      soundPoolRef.current.push(sound);
    }

    return soundPoolRef.current;
  }, [audioListener, stepSoundBuffers, targetRef]);

  useEffect(() => {
    volumeRef.current = globalVolume;
    soundPoolRef.current.forEach((sound) => {
      sound.setVolume(BASE_FOOTSTEP_VOLUME * globalVolume);
    });
  }, [globalVolume]);

  useEffect(() => {
    return () => {
      soundPoolRef.current.forEach((sound) => {
        if (sound.isPlaying) sound.stop();
        sound.removeFromParent();
        sound.disconnect();
      });
      soundPoolRef.current = [];
    };
  }, []);

  useFrame((state) => {
    if (locomotion !== 'walk' && locomotion !== 'run') return;

    const sounds = ensureSoundPool();
    const buffers = stepSoundBuffers?.current;
    if (!sounds?.length || !buffers?.length) return;

    const currentTime = state.clock.elapsedTime;
    const interval = locomotion === 'run'
      ? RUN_STEP_INTERVAL
      : WALK_STEP_INTERVAL;
    if (currentTime - lastStepTime.current < interval) return;

    lastStepTime.current = currentTime;
    let sound = null;
    for (let offset = 0; offset < sounds.length; offset += 1) {
      const index = (nextVoiceRef.current + offset) % sounds.length;
      if (!sounds[index].isPlaying) {
        sound = sounds[index];
        nextVoiceRef.current = (index + 1) % sounds.length;
        break;
      }
    }
    if (!sound) return;

    const buffer = buffers[Math.floor(Math.random() * buffers.length)];
    sound.setBuffer(buffer);
    sound.play();
  });

  return null;
}
