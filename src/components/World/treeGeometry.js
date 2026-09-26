import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom } from './noise';
import { applyCanopyAttributes } from './treeMaterials';

// [x, y, z, rayon] des masses de feuillage de chaque silhouette
export const CARD_TREE_VARIANTS = [
  {
    trunkHeight: 2.6,
    trunkRadius: 0.2,
    blobs: [
      [0, 4.3, 0, 1.9],
      [1.25, 3.7, 0.5, 1.4],
      [-1.15, 3.9, -0.6, 1.5],
      [0.3, 5.4, -0.4, 1.4],
      [-0.4, 3.5, 1.15, 1.3],
    ],
  },
  {
    trunkHeight: 2.3,
    trunkRadius: 0.17,
    blobs: [
      [0, 3.5, 0, 1.45],
      [0.2, 4.7, 0.1, 1.35],
      [-0.1, 5.9, -0.1, 1.15],
      [0.65, 3.9, -0.5, 1.1],
      [-0.6, 4.3, 0.55, 1.1],
      [0, 6.9, 0, 0.8],
    ],
  },
  {
    trunkHeight: 2.1,
    trunkRadius: 0.23,
    blobs: [
      [0, 3.7, 0, 1.7],
      [1.75, 3.3, 0.3, 1.4],
      [-1.65, 3.4, -0.2, 1.45],
      [0.2, 4.5, 1.25, 1.3],
      [-0.3, 4.4, -1.35, 1.3],
    ],
  },
];

function createLeafCards(center, radius, random) {
  const count = Math.max(6, Math.round(radius * radius * 10));
  const positions = [];
  const uvs = [];
  const indices = [];
  const direction = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const ring = Math.sqrt(Math.max(1 - y * y, 0));
    const theta = golden * i + random() * 0.6;
    direction.set(Math.cos(theta) * ring, y, Math.sin(theta) * ring);
    if (direction.y < -0.55) direction.y = -0.55 - (direction.y + 0.55) * 0.3;
    direction.normalize();

    jitter.set(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(1.3);
    normal.copy(direction).add(jitter).normalize();
    tangent.set(random() - 0.5, random() - 0.5, random() - 0.5).cross(normal).normalize();
    bitangent.crossVectors(normal, tangent);

    const size = radius * (0.95 + random() * 0.35);
    const distance = radius * (0.7 + random() * 0.22);
    const base = positions.length / 3;

    [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].forEach(([sx, sy, u, v]) => {
      corner
        .copy(center)
        .addScaledVector(direction, distance)
        .addScaledVector(tangent, sx * size * 0.5)
        .addScaledVector(bitangent, sy * size * 0.5);
      positions.push(corner.x, corner.y, corner.z);
      uvs.push(u, v);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(center.clone(), radius);
  return geometry;
}

function createLimb(from, to, radiusBottom, radiusTop, radialSegments = 7) {
  const length = from.distanceTo(to);
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments, 3, true);
  geometry.deleteAttribute('uv');
  geometry.translate(0, length / 2, 0);

  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const t = point.y / length;
    point.x += Math.sin(t * Math.PI) * 0.06 * length * 0.2;
    position.setXYZ(i, point.x, point.y, point.z);
  }

  const direction = new THREE.Vector3().subVectors(to, from).normalize();
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction));
  geometry.translate(from.x, from.y, from.z);
  geometry.computeVertexNormals();
  return geometry;
}

// Arbre « duveteux » léger : masses de cartes de feuilles + tronc effilé avec deux branches
export function createCardTreeGeometry(variant, seed) {
  const random = createRandom(seed);
  const blobs = variant.blobs.map(([x, y, z, radius]) => ({ center: new THREE.Vector3(x, y, z), radius }));

  const blobGeometries = blobs.map(({ center, radius }) => createLeafCards(center, radius, random));
  applyCanopyAttributes(blobGeometries);
  const canopy = mergeGeometries(blobGeometries);
  blobGeometries.forEach((geometry) => geometry.dispose());

  const trunkTop = new THREE.Vector3(0, variant.trunkHeight + 0.8, 0);
  const limbs = [createLimb(new THREE.Vector3(0, -0.2, 0), trunkTop, variant.trunkRadius, variant.trunkRadius * 0.55)];
  blobs
    .slice(1)
    .sort((a, b) => b.radius - a.radius)
    .slice(0, 2)
    .forEach(({ center }) => {
      const start = new THREE.Vector3(0, variant.trunkHeight * 0.8, 0);
      const end = start.clone().lerp(center, 0.75);
      limbs.push(createLimb(start, end, variant.trunkRadius * 0.5, variant.trunkRadius * 0.22, 5));
    });
  const trunk = mergeGeometries(limbs);
  limbs.forEach((geometry) => geometry.dispose());

  return { canopy, trunk };
}

// Silhouettes très simples pour la forêt lointaine
export function createDistantBroadleafGeometry() {
  const source = new THREE.IcosahedronGeometry(1, 1);
  source.deleteAttribute('uv');
  source.deleteAttribute('normal');
  const blob = mergeVertices(source);
  source.dispose();

  const position = blob.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const bump = 1 + Math.sin(point.x * 4.1 + point.y * 2.3) * 0.07 + Math.cos(point.z * 3.7 - point.y * 1.9) * 0.07;
    point.multiplyScalar(bump);
    point.y = point.y * 0.85 + 1.9;
    position.setXYZ(i, point.x, point.y, point.z);
  }
  blob.computeVertexNormals();

  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.4, 5, 1, true);
  trunk.deleteAttribute('uv');
  trunk.translate(0, 0.7, 0);
  const merged = mergeGeometries([blob, trunk]);
  blob.dispose();
  trunk.dispose();
  return merged;
}

export function createDistantPineGeometry() {
  const layers = [
    { radius: 1.25, height: 2.4, y: 1.1 },
    { radius: 0.95, height: 2.0, y: 2.3 },
    { radius: 0.62, height: 1.7, y: 3.4 },
  ].map(({ radius, height, y }) => {
    const cone = new THREE.ConeGeometry(radius, height, 7, 1, true);
    cone.deleteAttribute('uv');
    cone.translate(0, y + height / 2, 0);
    return cone;
  });
  const trunk = new THREE.CylinderGeometry(0.1, 0.15, 1.3, 5, 1, true);
  trunk.deleteAttribute('uv');
  trunk.translate(0, 0.65, 0);
  const merged = mergeGeometries([...layers, trunk]);
  layers.forEach((geometry) => geometry.dispose());
  trunk.dispose();
  return merged;
}
