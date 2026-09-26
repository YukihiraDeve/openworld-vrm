import * as THREE from 'three';

// Bruit déterministe (identique pour tous les clients) utilisé par le terrain, le placement de la végétation
// et la texture de bruit partagée par les shaders.

const GRADIENTS = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
});

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrap = (v, period) => (period > 0 ? ((v % period) + period) % period : v);

export function perlin2D(x, y, seed = 0, period = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const x0 = wrap(xi, period);
  const y0 = wrap(yi, period);
  const x1 = wrap(xi + 1, period);
  const y1 = wrap(yi + 1, period);

  const g00 = GRADIENTS[hash2(x0, y0, seed) & 15];
  const g10 = GRADIENTS[hash2(x1, y0, seed) & 15];
  const g01 = GRADIENTS[hash2(x0, y1, seed) & 15];
  const g11 = GRADIENTS[hash2(x1, y1, seed) & 15];

  const n00 = g00[0] * xf + g00[1] * yf;
  const n10 = g10[0] * (xf - 1) + g10[1] * yf;
  const n01 = g01[0] * xf + g01[1] * (yf - 1);
  const n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);

  const u = fade(xf);
  const v = fade(yf);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v;
}

// Renvoie une valeur approximativement dans [0, 1]
export function fbm2D(x, y, { octaves = 4, seed = 0, period = 0, lacunarity = 2, gain = 0.5 } = {}) {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const octavePeriod = period > 0 ? period * frequency : 0;
    sum += amplitude * perlin2D(x * frequency, y * frequency, seed + i * 131, octavePeriod);
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return THREE.MathUtils.clamp((sum / norm) * 1.2 + 0.5, 0, 1);
}

export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Texture de bruit tuilable : R = grandes taches, G = moyennes, B = détails, A = détails fins.
const NOISE_SIZE = 256;
const CHANNEL_PERIODS = [4, 8, 16, 32];
let noiseData = null;
let noiseTexture = null;

function buildNoiseData() {
  const data = new Float32Array(NOISE_SIZE * NOISE_SIZE * 4);
  for (let channel = 0; channel < 4; channel++) {
    const period = CHANNEL_PERIODS[channel];
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < NOISE_SIZE; y++) {
      for (let x = 0; x < NOISE_SIZE; x++) {
        const value = fbm2D((x / NOISE_SIZE) * period, (y / NOISE_SIZE) * period, {
          octaves: 4,
          seed: 17 + channel * 71,
          period,
        });
        data[(y * NOISE_SIZE + x) * 4 + channel] = value;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    const range = Math.max(max - min, 1e-5);
    for (let i = channel; i < data.length; i += 4) {
      data[i] = (data[i] - min) / range;
    }
  }
  return data;
}

export function getNoiseData() {
  if (!noiseData) noiseData = buildNoiseData();
  return noiseData;
}

export function getNoiseTexture() {
  if (noiseTexture) return noiseTexture;
  const source = getNoiseData();
  const bytes = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i++) bytes[i] = Math.round(source[i] * 255);

  noiseTexture = new THREE.DataTexture(bytes, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  noiseTexture.wrapS = THREE.RepeatWrapping;
  noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTexture.generateMipmaps = true;
  noiseTexture.colorSpace = THREE.NoColorSpace;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}

// Échantillonnage CPU bilinéaire, cohérent avec texture2D(uNoiseTexture, uv) côté GPU
export function sampleNoise(u, v, channel = 0) {
  const data = getNoiseData();
  const x = u * NOISE_SIZE - 0.5;
  const y = v * NOISE_SIZE - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const ix0 = wrap(x0, NOISE_SIZE);
  const iy0 = wrap(y0, NOISE_SIZE);
  const ix1 = wrap(x0 + 1, NOISE_SIZE);
  const iy1 = wrap(y0 + 1, NOISE_SIZE);
  const a = data[(iy0 * NOISE_SIZE + ix0) * 4 + channel];
  const b = data[(iy0 * NOISE_SIZE + ix1) * 4 + channel];
  const c = data[(iy1 * NOISE_SIZE + ix0) * 4 + channel];
  const d = data[(iy1 * NOISE_SIZE + ix1) * 4 + channel];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
