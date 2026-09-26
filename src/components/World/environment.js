import * as THREE from 'three';
import { getNoiseTexture } from './noise';

// Direction vers le soleil (matinée, ~27° au-dessus de l'horizon : ombres longues, lumière chaude)
export const SUN_DIRECTION = new THREE.Vector3(0.6, 0.45, -0.66).normalize();

export const SKY_COLORS = {
  zenith: '#2f6fd1',
  sky: '#6fa7e6',
  horizon: '#cfe2ee',
  sunHaze: '#ffe1b8',
  groundHaze: '#b9cdd2',
  sunDisk: '#fff3dc',
  cloudLit: '#fffaf2',
  cloudShade: '#a9bad3',
  mountainFar: '#7f9fc4',
  mountainNear: '#5f8a86',
  snow: '#f2f6fb',
};

export const LIGHTING = {
  sunColor: '#ffeacc',
  sunIntensity: 3.4,
  hemiSkyColor: '#cfe3ff',
  hemiGroundColor: '#7c8a4c',
  hemiIntensity: 1.35,
};

export const FOG = {
  density: 0.0042,
  heightFalloff: 0.028,
  baseHeight: 0,
};

export const WIND = {
  direction: new THREE.Vector2(0.86, 0.5).normalize(),
  strength: 1,
};

export const GRASS_COLORS = {
  base: '#1d3c10',
  lush: '#79b83c',
  deep: '#4f8f2a',
  dry: '#aeaa4e',
  pathEdge: '#98984c',
};

export const GROUND_COLORS = {
  lush: '#3d6a1f',
  dry: '#6f7b2e',
  dirt: '#b08a5c',
  dirtDark: '#7a5a3a',
};

const sunLight = new THREE.Color(LIGHTING.sunColor).multiplyScalar(LIGHTING.sunIntensity);

export const MAX_INTERACTIVE_PLAYERS = 12;

// Uniforms partagés par référence entre tous les matériaux (une seule mise à jour par frame)
export const sharedUniforms = {
  uTime: { value: 0 },
  uSunDirection: { value: SUN_DIRECTION.clone() },
  uSunColor: { value: sunLight },
  uWindDirection: { value: WIND.direction.clone() },
  uWindStrength: { value: WIND.strength },
  uNoiseTexture: { value: getNoiseTexture() },
  // Point suivi par la caméra : le feuillage placé entre les deux devient transparent
  uFocusPoint: { value: new THREE.Vector3(0, -1000, 0) },
  // Joueurs qui écartent l'herbe et les fleurs
  uPlayers: {
    value: Array.from({ length: MAX_INTERACTIVE_PLAYERS }, () => new THREE.Vector3(0, -1000, 0)),
  },
  uPlayerCount: { value: 0 },
};
