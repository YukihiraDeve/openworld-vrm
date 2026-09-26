export const QUALITY_LEVELS = ['low', 'medium', 'high'];

export const QUALITY_PRESETS = {
  low: {
    maxDpr: 1,
    postprocessing: false,
    multisampling: 0,
    shadowMapSize: 1024,
    shadowExtent: 28,
    grassDensity: 0.45,
  },
  medium: {
    maxDpr: 1.25,
    postprocessing: true,
    multisampling: 2,
    shadowMapSize: 2048,
    shadowExtent: 34,
    grassDensity: 0.75,
  },
  high: {
    maxDpr: 1.6,
    postprocessing: true,
    multisampling: 4,
    shadowMapSize: 4096,
    shadowExtent: 40,
    grassDensity: 1,
  },
};

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return mobileUA || (coarse && navigator.maxTouchPoints > 0);
}

export function detectInitialQuality() {
  if (typeof window === 'undefined') return 'high';

  const requested = new URLSearchParams(window.location.search).get('quality');
  if (QUALITY_LEVELS.includes(requested)) return requested;

  if (isTouchDevice()) return 'low';
  if ((navigator.hardwareConcurrency || 8) <= 4) return 'medium';
  return 'high';
}

export function qualityFromLevel(level) {
  return QUALITY_LEVELS[Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level))];
}

export function levelFromQuality(quality) {
  return Math.max(0, QUALITY_LEVELS.indexOf(quality));
}
