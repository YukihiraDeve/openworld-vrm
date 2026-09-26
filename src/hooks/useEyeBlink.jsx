import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

const CLOSE_TIME = 0.06;
const HOLD_TIME = 0.04;
const OPEN_TIME = 0.15;
const BLINK_TIME = CLOSE_TIME + HOLD_TIME + OPEN_TIME;
const DOUBLE_BLINK_CHANCE = 0.18;

const nextInterval = () => 2.2 + Math.random() * 4.4;

function blinkWeight(time) {
  if (time < CLOSE_TIME) return time / CLOSE_TIME;
  if (time < CLOSE_TIME + HOLD_TIME) return 1;
  const opening = Math.min((time - CLOSE_TIME - HOLD_TIME) / OPEN_TIME, 1);
  return 1 - opening * (2 - opening);
}

/**
 * Clignement naturel des avatars VRM : fermeture rapide, réouverture plus lente,
 * intervalles aléatoires et doubles clignements occasionnels.
 * @param {Object} vrmRef - Référence vers l'instance VRM
 */
export default function useEyeBlink(vrmRef) {
  const stateRef = useRef({ vrm: null, wait: 0, time: -1, wasDouble: false });

  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    const manager = vrm?.expressionManager;
    if (!manager) return;

    const state = stateRef.current;
    if (state.vrm !== vrm) {
      state.vrm = vrm;
      state.time = -1;
      state.wait = 1 + Math.random() * 2;
    }

    const step = Math.min(delta, 0.05);
    if (state.time < 0) {
      state.wait -= step;
      if (state.wait > 0) return;
      state.time = 0;
    }

    state.time += step;
    if (state.time < BLINK_TIME) {
      manager.setValue('blink', blinkWeight(state.time));
      return;
    }

    manager.setValue('blink', 0);
    state.time = -1;
    const doubleBlink = !state.wasDouble && Math.random() < DOUBLE_BLINK_CHANCE;
    state.wasDouble = doubleBlink;
    state.wait = doubleBlink ? 0.1 : nextInterval();
  });

  useEffect(() => () => {
    vrmRef.current?.expressionManager?.setValue('blink', 0);
  }, [vrmRef]);
}
