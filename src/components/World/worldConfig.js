import { DECOR_GRASS_ZONES, DECOR_TREE_ZONES } from './decorLayout';

export const FANTASY_HOUSE_CONFIG = Object.freeze({
  url: '/assets/models/maison-fantasy/Maison_Fantasy_Modulaire.gltf',
  position: Object.freeze([18, 0.2, -12]),
  rotation: Object.freeze([0, 0, 0]),
  footprint: Object.freeze({
    centerX: 17.39,
    centerZ: -11,
    halfWidth: 7.5,
    halfDepth: 5.9,
    feather: 1.25,
    height: 0.25,
  }),
});

export const WORLD_EXCLUSION_ZONES = Object.freeze([
  Object.freeze({
    center: Object.freeze([
      FANTASY_HOUSE_CONFIG.footprint.centerX,
      FANTASY_HOUSE_CONFIG.footprint.centerZ,
    ]),
    halfSize: Object.freeze([
      FANTASY_HOUSE_CONFIG.footprint.halfWidth,
      FANTASY_HOUSE_CONFIG.footprint.halfDepth,
    ]),
    feather: 0.35,
  }),
  ...DECOR_GRASS_ZONES,
]);

export const TREE_EXCLUSION_ZONES = Object.freeze([
  ...WORLD_EXCLUSION_ZONES,
  ...DECOR_TREE_ZONES,
]);

function smoothstep(value) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function getExclusionDensity(x, z, zones = WORLD_EXCLUSION_ZONES) {
  let density = 1;

  for (let index = 0; index < zones.length; index++) {
    const zone = zones[index];
    const feather = Math.max(zone.feather ?? 0, 0.001);
    const absoluteX = Math.abs(x - zone.center[0]);
    const absoluteZ = Math.abs(z - zone.center[1]);

    if (
      absoluteX >= zone.halfSize[0] + feather ||
      absoluteZ >= zone.halfSize[1] + feather
    ) {
      continue;
    }

    const dx = Math.max(absoluteX - zone.halfSize[0], 0);
    const dz = Math.max(absoluteZ - zone.halfSize[1], 0);
    const distance = Math.hypot(dx, dz);
    density = Math.min(density, smoothstep(distance / feather));
  }

  return density;
}

export function isInsideExclusionZone(
  x,
  z,
  zones = WORLD_EXCLUSION_ZONES,
  padding = 0,
) {
  return zones.some((zone) => (
    Math.abs(x - zone.center[0]) <= zone.halfSize[0] + padding &&
    Math.abs(z - zone.center[1]) <= zone.halfSize[1] + padding
  ));
}
