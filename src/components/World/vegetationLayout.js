import { calculateHeight, distanceOutsidePlayArea, WALL_HALF_SIZE } from './terrain';
import { isPositionOnPath } from './Paths';
import { isInsideExclusionZone, TREE_EXCLUSION_ZONES, WORLD_EXCLUSION_ZONES } from './worldConfig';
import { createRandom, sampleNoise } from './noise';

const SPAWN_CLEAR_RADIUS = 6;
const layoutCache = new WeakMap();

function slopeAt(x, z) {
  const h = calculateHeight(x, z);
  return Math.max(
    Math.abs(calculateHeight(x + 1, z) - h),
    Math.abs(calculateHeight(x, z + 1) - h),
  );
}

// Arbres principaux (modèle arbre.glb) à l'intérieur de la zone jouable
function buildHeroTrees(paths) {
  const random = createRandom(42);
  const count = 34;
  const minDistance = 4.6;
  const trees = [];
  const limit = WALL_HALF_SIZE - 3;

  for (let attempt = 0; attempt < count * 40 && trees.length < count; attempt++) {
    const x = (random() - 0.5) * 2 * limit;
    const z = (random() - 0.5) * 2 * limit;
    const scale = 1.5 * (0.8 + random() * 0.7);
    const rotation = random() * Math.PI * 2;
    const tint = random();

    if (Math.hypot(x, z) < SPAWN_CLEAR_RADIUS) continue;
    if (isPositionOnPath(x, z, paths, 2.8)) continue;
    if (isInsideExclusionZone(x, z, TREE_EXCLUSION_ZONES, 3)) continue;
    if (slopeAt(x, z) > 0.35) continue;
    if (trees.some((tree) => (tree.x - x) ** 2 + (tree.z - z) ** 2 < minDistance ** 2)) continue;

    trees.push({ x, y: calculateHeight(x, z), z, scale, rotation, tint });
  }
  return trees;
}

// Lisière dense juste derrière les murs invisibles, avec des trouées pour laisser filer les routes
function buildForestRing(paths, heroTrees) {
  const random = createRandom(7331);
  const trees = [];
  const minDistance = 3.4;

  for (let attempt = 0; attempt < 24000 && trees.length < 460; attempt++) {
    const x = (random() - 0.5) * 2 * 90;
    const z = (random() - 0.5) * 2 * 90;
    const outside = Math.max(Math.abs(x), Math.abs(z)) - WALL_HALF_SIZE;
    if (outside < 1.5 || outside > 38) continue;

    const density = 1 - Math.min(Math.max((outside - 12) / 26, 0), 1) * 0.75;
    if (random() > density) continue;
    if (isPositionOnPath(x, z, paths, 5)) continue;
    if (heroTrees.some((tree) => (tree.x - x) ** 2 + (tree.z - z) ** 2 < 25)) continue;
    if (trees.some((tree) => (tree.x - x) ** 2 + (tree.z - z) ** 2 < minDistance ** 2)) continue;

    trees.push({
      x,
      y: calculateHeight(x, z),
      z,
      scale: 1.1 + random() * 0.8 + Math.min(outside / 40, 1) * 0.4,
      rotation: random() * Math.PI * 2,
      tint: random(),
      variant: Math.floor(random() * 3),
    });
  }
  return trees;
}

// Forêts lointaines sur les collines : placées dans les zones sombres du shader de sol
function buildFarForest(paths) {
  const random = createRandom(9001);
  const trees = [];

  for (let attempt = 0; attempt < 60000 && trees.length < 2600; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = 80 + Math.pow(random(), 0.8) * 420;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const outside = distanceOutsidePlayArea(x, z);
    if (outside < 22 || outside > 440) continue;

    const forest = sampleNoise(x * 0.0042 + 0.5, z * 0.0042 + 0.2, 1);
    const chance = forest > 0.56 ? 0.95 : forest > 0.45 ? 0.12 : 0.02;
    if (random() > chance) continue;
    if (isPositionOnPath(x, z, paths, 6)) continue;
    if (slopeAt(x, z) > 1.2) continue;

    trees.push({
      x,
      y: calculateHeight(x, z),
      z,
      scale: 0.9 + random() * 0.9,
      rotation: random() * Math.PI * 2,
      tint: random(),
      pine: random() < 0.1 + Math.min(outside / 400, 1) * 0.4,
    });
  }
  return trees;
}

// Massifs de fleurs (> ~0.6) : partagé par les fleurs et les papillons qui les survolent
export function flowerPatchValue(x, z) {
  return sampleNoise(x * 0.031 + 0.37, z * 0.031 + 0.73, 0);
}

export function getVegetationLayout(paths) {
  const key = paths && typeof paths === 'object' ? paths : WORLD_EXCLUSION_ZONES;
  let layout = layoutCache.get(key);
  if (!layout) {
    const heroTrees = buildHeroTrees(paths);
    layout = {
      heroTrees,
      ringTrees: buildForestRing(paths, heroTrees),
      farTrees: buildFarForest(paths),
    };
    layoutCache.set(key, layout);
  }
  return layout;
}
