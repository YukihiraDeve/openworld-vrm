import * as THREE from 'three';
import { getPathInstances } from './Paths';
import { sampleNoise } from './noise';
import { DECOR_CLEARINGS } from './decorLayout';

export const PATH_MASK_RESOLUTION = 2048;
export const PATH_MASK_EXTENT = 160;

const cache = new WeakMap();

// Masque des chemins (1 = herbe, 0 = terre), partagé par le shader du sol et le placement de l'herbe
// pour que les bords coïncident exactement.
export function getPathMask(paths) {
  let mask = cache.get(paths);
  if (mask) return mask;

  const canvas = document.createElement('canvas');
  canvas.width = PATH_MASK_RESOLUTION;
  canvas.height = PATH_MASK_RESOLUTION;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PATH_MASK_RESOLUTION, PATH_MASK_RESOLUTION);
  ctx.translate(PATH_MASK_RESOLUTION / 2, PATH_MASK_RESOLUTION / 2);
  const scale = PATH_MASK_RESOLUTION / (PATH_MASK_EXTENT * 2);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000000';
  ctx.shadowColor = '#000000';

  getPathInstances(paths).forEach((path) => {
    const points = path.points;
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);

    ctx.shadowBlur = 10;
    ctx.lineWidth = path.width * 1.1;
    ctx.stroke();

    ctx.shadowBlur = 4;
    ctx.lineWidth = path.width * 0.75;
    ctx.stroke();
  });

  ctx.fillStyle = '#000000';
  DECOR_CLEARINGS.forEach((clearing) => {
    [[0.95, 10], [0.7, 4]].forEach(([factor, blur]) => {
      ctx.shadowBlur = blur;
      ctx.beginPath();
      ctx.arc(clearing.x, clearing.z, clearing.radius * factor, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  const pixels = ctx.getImageData(0, 0, PATH_MASK_RESOLUTION, PATH_MASK_RESOLUTION).data;
  const values = new Uint8Array(PATH_MASK_RESOLUTION * PATH_MASK_RESOLUTION);
  for (let i = 0; i < values.length; i++) values[i] = pixels[i * 4];

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;

  mask = { texture, values };
  cache.set(paths, mask);
  return mask;
}

export function samplePathMask(mask, x, z) {
  const size = PATH_MASK_RESOLUTION;
  const px = (x / (2 * PATH_MASK_EXTENT) + 0.5) * size - 0.5;
  const py = (z / (2 * PATH_MASK_EXTENT) + 0.5) * size - 0.5;
  if (px < 0 || py < 0 || px >= size - 1 || py >= size - 1) return 1;

  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const fx = px - x0;
  const fy = py - y0;
  const i = y0 * size + x0;
  const { values } = mask;
  const top = values[i] + (values[i + 1] - values[i]) * fx;
  const bottom = values[i + size] + (values[i + size + 1] - values[i + size]) * fx;
  return (top + (bottom - top) * fy) / 255;
}

// Même bruit de bord que le shader du sol
export function pathEdgeValue(mask, x, z) {
  return samplePathMask(mask, x, z) + (sampleNoise(x * 0.19, z * 0.19, 2) - 0.5) * 0.4;
}
