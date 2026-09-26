import * as THREE from 'three';
import { calculateHeight } from './terrain';
import { DECOR_FOOTPATHS } from './decorLayout';

// Classe pour définir un chemin
export class Path {
  constructor(type, points, width, material = 'dirt') {
    this.type = type; // 'straight', 'curve', 'road'
    this.originalPoints = points; // Points originaux
    this.points = this.generateSmoothPath(points); // Points lissés
    this.width = width;
    this.material = material;
    this.segmentGridCellSize = 4;
    this.segments = this.points.slice(0, -1).map((start, index) => {
      const end = this.points[index + 1];
      const dx = end.x - start.x;
      const dz = end.y - start.y;
      const endX = start.x + dx;
      const endZ = start.y + dz;

      return {
        startX: start.x,
        startZ: start.y,
        dx,
        dz,
        lengthSq: dx * dx + dz * dz,
        minCellX: Math.floor(
          Math.min(start.x, endX) / this.segmentGridCellSize,
        ),
        maxCellX: Math.floor(
          Math.max(start.x, endX) / this.segmentGridCellSize,
        ),
        minCellZ: Math.floor(
          Math.min(start.y, endZ) / this.segmentGridCellSize,
        ),
        maxCellZ: Math.floor(
          Math.max(start.y, endZ) / this.segmentGridCellSize,
        ),
      };
    });
    this.segmentQueryMarks = new Uint32Array(this.segments.length);
    this.segmentQueryStamp = 0;

    this.gridMinCellX = this.segments.length > 0
      ? Math.min(...this.segments.map((segment) => segment.minCellX))
      : 0;
    this.gridMaxCellX = this.segments.length > 0
      ? Math.max(...this.segments.map((segment) => segment.maxCellX))
      : -1;
    this.gridMinCellZ = this.segments.length > 0
      ? Math.min(...this.segments.map((segment) => segment.minCellZ))
      : 0;
    this.gridMaxCellZ = this.segments.length > 0
      ? Math.max(...this.segments.map((segment) => segment.maxCellZ))
      : -1;
    this.gridRowCount = Math.max(
      this.gridMaxCellZ - this.gridMinCellZ + 1,
      0,
    );
    const gridColumnCount = Math.max(
      this.gridMaxCellX - this.gridMinCellX + 1,
      0,
    );
    this.segmentGrid = new Array(gridColumnCount * this.gridRowCount);

    this.segments.forEach((segment, index) => {
      for (
        let cellX = segment.minCellX;
        cellX <= segment.maxCellX;
        cellX++
      ) {
        const columnOffset =
          (cellX - this.gridMinCellX) * this.gridRowCount;

        for (
          let cellZ = segment.minCellZ;
          cellZ <= segment.maxCellZ;
          cellZ++
        ) {
          const gridIndex =
            columnOffset + cellZ - this.gridMinCellZ;
          const indices = this.segmentGrid[gridIndex];
          if (indices) {
            indices.push(index);
          } else {
            this.segmentGrid[gridIndex] = [index];
          }
        }
      }
    });
  }

  // Génère un chemin lissé avec des courbes de Catmull-Rom pour des transitions ultra-fluides
  generateSmoothPath(originalPoints) {
    if (originalPoints.length < 2) return originalPoints;

    const smoothPoints = [];
    const resolution = 20; // Nombre de points par segment pour des courbes ultra-lisses

    // Étendre les points pour avoir des tangentes naturelles aux extrémités
    const extendedPoints = [...originalPoints];

    // Ajouter un point fictif au début pour la tangente
    const firstDir = new THREE.Vector2(
      originalPoints[1].x - originalPoints[0].x,
      originalPoints[1].y - originalPoints[0].y
    ).normalize().multiplyScalar(-2);
    extendedPoints.unshift(new THREE.Vector2(
      originalPoints[0].x + firstDir.x,
      originalPoints[0].y + firstDir.y
    ));

    // Ajouter un point fictif à la fin pour la tangente
    const lastIdx = originalPoints.length - 1;
    const lastDir = new THREE.Vector2(
      originalPoints[lastIdx].x - originalPoints[lastIdx - 1].x,
      originalPoints[lastIdx].y - originalPoints[lastIdx - 1].y
    ).normalize().multiplyScalar(2);
    extendedPoints.push(new THREE.Vector2(
      originalPoints[lastIdx].x + lastDir.x,
      originalPoints[lastIdx].y + lastDir.y
    ));

    // Générer les courbes de Catmull-Rom entre chaque segment
    for (let i = 1; i < extendedPoints.length - 2; i++) {
      const p0 = extendedPoints[i - 1];
      const p1 = extendedPoints[i];
      const p2 = extendedPoints[i + 1];
      const p3 = extendedPoints[i + 2];

      // Générer des points le long de la courbe de Catmull-Rom
      for (let t = 0; t < resolution; t++) {
        const u = t / resolution;
        const point = this.catmullRomSpline(p0, p1, p2, p3, u);
        smoothPoints.push(point);
      }
    }

    // Ajouter le dernier point
    smoothPoints.push(originalPoints[originalPoints.length - 1]);

    return smoothPoints;
  }

  // Spline de Catmull-Rom pour des courbes ultra-fluides
  catmullRomSpline(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;

    // Formule de Catmull-Rom
    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );

    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );

    return new THREE.Vector2(x, y);
  }

  // Vérifie si un point (x, z) est sur ce chemin
  isOnPath(x, z, margin = 0) {
    const effectiveWidth = this.width + margin;
    const maxDistanceSq = (effectiveWidth * effectiveWidth) / 4;
    return this.getNearbyMinDistanceSq(x, z, effectiveWidth / 2) <= maxDistanceSq;
  }

  getNearbyMinDistanceSq(x, z, radius) {
    const cellSize = this.segmentGridCellSize;
    const minCellX = Math.max(
      Math.floor((x - radius) / cellSize),
      this.gridMinCellX,
    );
    const maxCellX = Math.min(
      Math.floor((x + radius) / cellSize),
      this.gridMaxCellX,
    );
    const minCellZ = Math.max(
      Math.floor((z - radius) / cellSize),
      this.gridMinCellZ,
    );
    const maxCellZ = Math.min(
      Math.floor((z + radius) / cellSize),
      this.gridMaxCellZ,
    );
    let minDistanceSq = Infinity;

    if (minCellX > maxCellX || minCellZ > maxCellZ) {
      return minDistanceSq;
    }

    this.segmentQueryStamp = (this.segmentQueryStamp + 1) >>> 0;
    if (this.segmentQueryStamp === 0) {
      this.segmentQueryMarks.fill(0);
      this.segmentQueryStamp = 1;
    }
    const queryStamp = this.segmentQueryStamp;

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      const columnOffset =
        (cellX - this.gridMinCellX) * this.gridRowCount;

      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const indices = this.segmentGrid[
          columnOffset + cellZ - this.gridMinCellZ
        ];
        if (!indices) continue;

        for (let listIndex = 0; listIndex < indices.length; listIndex++) {
          const segmentIndex = indices[listIndex];
          if (this.segmentQueryMarks[segmentIndex] === queryStamp) continue;
          this.segmentQueryMarks[segmentIndex] = queryStamp;
          minDistanceSq = Math.min(
            minDistanceSq,
            this.distanceSqToSegment(x, z, this.segments[segmentIndex]),
          );
        }
      }
    }

    return minDistanceSq;
  }

  distanceSqToSegment(x, z, segment) {
    const pointX = x - segment.startX;
    const pointZ = z - segment.startZ;
    const projection = segment.lengthSq > 0
      ? Math.min(Math.max(
        (pointX * segment.dx + pointZ * segment.dz) / segment.lengthSq,
        0,
      ), 1)
      : 0;
    const closestX = segment.startX + projection * segment.dx;
    const closestZ = segment.startZ + projection * segment.dz;
    const distanceX = x - closestX;
    const distanceZ = z - closestZ;

    return distanceX * distanceX + distanceZ * distanceZ;
  }

  // Calcule la distance d'un point à un segment de ligne
  distancePointToLineSegment(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dz = lineEnd.y - lineStart.y;
    return Math.sqrt(this.distanceSqToSegment(point.x, point.y, {
      startX: lineStart.x,
      startZ: lineStart.y,
      dx,
      dz,
      lengthSq: dx * dx + dz * dz,
    }));
  }

  // Génère la géométrie du chemin avec largeur variable
  generateGeometry(frequency = 0.1, amplitude = 1) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];

    // Calculer la longueur totale du chemin pour les UVs
    let totalLength = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      totalLength += this.points[i].distanceTo(this.points[i + 1]);
    }

    let currentLength = 0;

    // Générer la géométrie continue avec des tangentes calculées de manière fluide
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i];

      // Calculer la tangente en utilisant plusieurs points pour plus de fluidité
      let tangent;
      const lookAhead = Math.min(3, Math.floor(this.points.length / 4)); // Regarder plus loin pour lisser

      if (i === 0) {
        // Premier point : tangente basée sur les premiers points
        const endIdx = Math.min(i + lookAhead, this.points.length - 1);
        tangent = new THREE.Vector2(
          this.points[endIdx].x - point.x,
          this.points[endIdx].y - point.y
        ).normalize();
      } else if (i === this.points.length - 1) {
        // Dernier point : tangente basée sur les derniers points
        const startIdx = Math.max(i - lookAhead, 0);
        tangent = new THREE.Vector2(
          point.x - this.points[startIdx].x,
          point.y - this.points[startIdx].y
        ).normalize();
      } else {
        // Point intermédiaire : moyenne pondérée des tangentes locales et globales
        const prevIdx = Math.max(i - lookAhead, 0);
        const nextIdx = Math.min(i + lookAhead, this.points.length - 1);

        // Tangente locale (adjacente)
        const localTangent = new THREE.Vector2(
          this.points[i + 1].x - this.points[i - 1].x,
          this.points[i + 1].y - this.points[i - 1].y
        ).normalize();

        // Tangente globale (plus large)
        const globalTangent = new THREE.Vector2(
          this.points[nextIdx].x - this.points[prevIdx].x,
          this.points[nextIdx].y - this.points[prevIdx].y
        ).normalize();

        // Mélange pour une transition ultra-fluide
        tangent = new THREE.Vector2(
          (localTangent.x * 0.7 + globalTangent.x * 0.3),
          (localTangent.y * 0.7 + globalTangent.y * 0.3)
        ).normalize();
      }

      // Calculer la perpendiculaire pour la largeur avec lissage
      const perpendicular = new THREE.Vector2(-tangent.y, tangent.x);

      // Variation très douce de la largeur pour un aspect naturel
      const distanceFromStart = currentLength / totalLength;
      const widthVariation = 0.9 + 0.2 * Math.sin(distanceFromStart * Math.PI * 3) * 0.5; // Variation sinusoïdale douce
      const halfWidth = (this.width / 2) * widthVariation;

      // Points gauche et droit avec un léger décalage aléatoire pour l'aspect naturel
      const randomOffset = 0.02; // Très petit décalage pour l'aspect organique
      const leftPoint = new THREE.Vector2(
        point.x - perpendicular.x * halfWidth + (Math.random() - 0.5) * randomOffset,
        point.y - perpendicular.y * halfWidth + (Math.random() - 0.5) * randomOffset
      );
      const rightPoint = new THREE.Vector2(
        point.x + perpendicular.x * halfWidth + (Math.random() - 0.5) * randomOffset,
        point.y + perpendicular.y * halfWidth + (Math.random() - 0.5) * randomOffset
      );

      // Calculer les hauteurs du terrain
      const leftHeight = calculateHeight(leftPoint.x, leftPoint.y, frequency, amplitude);
      const rightHeight = calculateHeight(rightPoint.x, rightPoint.y, frequency, amplitude);

      // Offset plus important pour éviter le z-fighting avec le sol
      const offset = 0.03;

      // Ajouter les vertices (gauche et droit)
      vertices.push(
        leftPoint.x, leftHeight + offset, leftPoint.y,    // Vertex gauche
        rightPoint.x, rightHeight + offset, rightPoint.y  // Vertex droit
      );

      // Calculer les UVs avec répétition naturelle
      const vPos = (currentLength / totalLength) * 3; // Répéter la texture 3 fois sur la longueur
      uvs.push(
        0, vPos % 1,  // Côté gauche
        1, vPos % 1   // Côté droit
      );

      // Ajouter à la longueur courante si ce n'est pas le dernier point
      if (i < this.points.length - 1) {
        currentLength += this.points[i].distanceTo(this.points[i + 1]);
      }
    }

    // Créer les indices pour connecter les vertices de manière fluide
    for (let i = 0; i < this.points.length - 1; i++) {
      const baseIndex = i * 2; // Chaque point génère 2 vertices (gauche et droit)

      // Créer un quad entre les points i et i+1 avec faces vers le haut
      indices.push(
        baseIndex, baseIndex + 1, baseIndex + 2,      // Triangle 1
        baseIndex + 1, baseIndex + 3, baseIndex + 2   // Triangle 2
      );
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  // Calcule un facteur de transition (0 = pas d'herbe, 1 = herbe complète)
  getPathTransition(x, z, transitionDistance = 1.0) {
    const pathHalfWidth = this.width / 2;
    const transitionEnd = pathHalfWidth + transitionDistance;
    const minDistanceSq = this.getNearbyMinDistanceSq(x, z, transitionEnd);

    if (minDistanceSq > transitionEnd * transitionEnd) return 1;

    const minDistance = Math.sqrt(minDistanceSq);

    // Zone du chemin lui-même (0% d'herbe)
    if (minDistance <= pathHalfWidth) {
      return 0;
    }

    // Zone de transition
    const transitionStart = pathHalfWidth;
    if (minDistance <= transitionEnd) {
      // Transition douce avec courbe sigmoïde pour plus de naturel
      const t = (minDistance - transitionStart) / transitionDistance;
      // Courbe sigmoïde pour transition plus naturelle
      return t * t * (3 - 2 * t); // smoothstep
    }

    // Zone normale (100% d'herbe)
    return 1;
  }
}

// Le chemin visible est déjà intégré au shader du terrain. Garder ce composant
// vide évite de charger et construire les anciens meshes PBR invisibles.
export default function Paths() {
  return null;
}

// Fonction utilitaire pour créer des chemins prédéfinis.
// Les points extrêmes prolongent les routes dans les collines lointaines, dans l'alignement
// des segments d'origine pour ne pas modifier leur tracé dans la zone jouable.
export function createPaths() {
  return [
    // Route Principale : Grande traverse d'Ouest en Est
    {
      type: 'road',
      material: 'dirt',
      width: 4.0,
      points: [
        new THREE.Vector2(-150, -24),
        new THREE.Vector2(-60, -15),
        new THREE.Vector2(-30, -12),
        new THREE.Vector2(-10, -5),  // Intersection
        new THREE.Vector2(10, 0),
        new THREE.Vector2(40, -5),
        new THREE.Vector2(60, -10),
        new THREE.Vector2(150, -32.5)
      ]
    },
    // Route Secondaire : Embranchement vers le Nord-Est
    {
      type: 'road',
      material: 'dirt',
      width: 3.0,
      points: [
        new THREE.Vector2(-10, -5),  // Intersection parfaite
        new THREE.Vector2(-5, 10),
        new THREE.Vector2(10, 30),
        new THREE.Vector2(30, 50),
        new THREE.Vector2(40, 60),
        new THREE.Vector2(130, 150)
      ]
    },
    // Sentiers vers le moulin et le puits
    ...DECOR_FOOTPATHS.map((footpath) => ({
      type: 'footpath',
      material: 'dirt',
      width: footpath.width,
      points: footpath.points.map((point) => new THREE.Vector2(point.x, point.z)),
    })),
  ];
}

// Fonction pour calculer le facteur de transition pour tous les chemins (utilisée par Grass)
export function getPathTransitionFactor(x, z, paths, transitionDistance = 1.2) {
  let minTransition = 1; // Commence avec 100% d'herbe

  for (const path of getPathInstances(paths)) {
    const transition = path.getPathTransition(x, z, transitionDistance);
    minTransition = Math.min(minTransition, transition);
  }

  return minTransition;
}

// Fonction pour vérifier si une position est sur un chemin (utilisée par Grass)
export function isPositionOnPath(x, z, paths, margin = 0.5) {
  for (const path of getPathInstances(paths)) {
    if (path.isOnPath(x, z, margin)) {
      return true;
    }
  }
  return false;
}

const pathInstancesCache = new WeakMap();

export function getPathInstances(paths) {
  if (!paths || typeof paths !== 'object') return [];

  let instances = pathInstancesCache.get(paths);
  if (!instances) {
    instances = paths.map((pathData) => (
      pathData instanceof Path
        ? pathData
        : new Path(
          pathData.type,
          pathData.points,
          pathData.width,
          pathData.material,
        )
    ));
    pathInstancesCache.set(paths, instances);
  }

  return instances;
}
