import { FANTASY_HOUSE_CONFIG } from './worldConfig';
import { fbm2D } from './noise';

export const TERRAIN_FREQUENCY = 0.1;
export const TERRAIN_AMPLITUDE = 1;

// Zone jouable (murs invisibles) et début des collines extérieures
export const PLAY_AREA_HALF_SIZE = 50;
export const WALL_HALF_SIZE = 49.5;
const OUTER_START = 54;
const OUTER_CORNER = 18;
const OUTER_INNER_BOX = OUTER_START - OUTER_CORNER;

const HOUSE_FOOTPRINT = FANTASY_HOUSE_CONFIG.footprint;

const smooth01 = (t) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

function flattenHouse(x, z, terrainHeight) {
  const { centerX, centerZ, halfWidth, halfDepth, feather, height } = HOUSE_FOOTPRINT;
  const absoluteX = Math.abs(x - centerX);
  const absoluteZ = Math.abs(z - centerZ);

  if (absoluteX >= halfWidth + feather || absoluteZ >= halfDepth + feather) {
    return terrainHeight;
  }

  const dx = Math.max(absoluteX - halfWidth, 0);
  const dz = Math.max(absoluteZ - halfDepth, 0);
  const distance = Math.hypot(dx, dz);
  if (distance >= feather) return terrainHeight;

  const blend = 1 - smooth01(distance / feather);
  return terrainHeight + (height - terrainHeight) * blend;
}

// Distance (négative à l'intérieur) à un carré arrondi de demi-côté OUTER_START
export function distanceOutsidePlayArea(x, z) {
  const qx = Math.abs(x) - OUTER_INNER_BOX;
  const qz = Math.abs(z) - OUTER_INNER_BOX;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qz), 0) - OUTER_CORNER;
}

// Collines décoratives autour de la zone jouable ; le bord lointain plonge sous l'horizon
// pour se fondre entièrement dans le brouillard.
function outerTerrain(x, z) {
  if (Math.abs(x) <= OUTER_INNER_BOX && Math.abs(z) <= OUTER_INNER_BOX) return 0;
  const d = distanceOutsidePlayArea(x, z);
  if (d <= 0) return 0;

  const rise = smooth01(d / 110) * 14 + d * 0.012;
  const hillNoise = fbm2D(x * 0.0085, z * 0.0085, { octaves: 4, seed: 11 });
  const hills = Math.pow(hillNoise, 1.7) * 38 * smooth01((d - 25) / 160);
  const ripples = (fbm2D(x * 0.035, z * 0.035, { octaves: 3, seed: 29 }) - 0.5) * 3 * smooth01(d / 40);
  const edgeDrop = smooth01((d - 430) / 260) * 95;
  return rise + hills + ripples - edgeDrop;
}

export function calculateHeight(x, z, frequency = TERRAIN_FREQUENCY, amplitude = TERRAIN_AMPLITUDE) {
  const terrainHeight = Math.sin(x * frequency) * Math.cos(z * frequency) * amplitude;
  return flattenHouse(x, z, terrainHeight) + outerTerrain(x, z);
}
