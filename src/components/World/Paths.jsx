import { useRef, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { calculateHeight } from './Ground';

// Classe pour définir un chemin
class Path {
  constructor(type, points, width, material = 'dirt') {
    this.type = type; // 'straight', 'curve', 'road'
    this.originalPoints = points; // Points originaux
    this.points = this.generateSmoothPath(points); // Points lissés
    this.width = width;
    this.material = material;
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
    const point = new THREE.Vector2(x, z);
    const effectiveWidth = this.width + margin;

    // Pour chaque segment du chemin lissé
    for (let i = 0; i < this.points.length - 1; i++) {
      const start = this.points[i];
      const end = this.points[i + 1];
      
      // Calculer la distance du point au segment de ligne
      const distance = this.distancePointToLineSegment(point, start, end);
      
      if (distance <= effectiveWidth / 2) {
        return true;
      }
    }
    
    return false;
  }

  // Calcule la distance d'un point à un segment de ligne
  distancePointToLineSegment(point, lineStart, lineEnd) {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Génère la géométrie du chemin avec largeur variable
  generateGeometry() {
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
      const leftHeight = calculateHeight(leftPoint.x, leftPoint.y, 0.1, 1);
      const rightHeight = calculateHeight(rightPoint.x, rightPoint.y, 0.1, 1);
      
      // Offset minimal pour suivre parfaitement le terrain
      const offset = 0.0001; // Légèrement plus haut pour être visible
      
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
    const point = new THREE.Vector2(x, z);
    let minDistance = Infinity;

    // Trouver la distance minimale à tous les segments du chemin
    for (let i = 0; i < this.points.length - 1; i++) {
      const start = this.points[i];
      const end = this.points[i + 1];
      const distance = this.distancePointToLineSegment(point, start, end);
      minDistance = Math.min(minDistance, distance);
    }

    const pathHalfWidth = this.width / 2;
    
    // Zone du chemin lui-même (0% d'herbe)
    if (minDistance <= pathHalfWidth) {
      return 0;
    }
    
    // Zone de transition
    const transitionStart = pathHalfWidth;
    const transitionEnd = pathHalfWidth + transitionDistance;
    
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

// Composant principal des chemins
export default function Paths({ 
  paths = [],
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1 
}) {
  const groupRef = useRef();

  // États pour la gestion des textures
  const [texturesLoaded, setTexturesLoaded] = useState(false);
  const [hasTextureError, setHasTextureError] = useState(false);

  // Charger les textures avec useTexture (toujours appelé)
  const diffuseTexture = useTexture('/assets/textures/path/sandstone_cracks_diff_4k.jpg', 
    (texture) => {
      console.log('Texture diffuse chargée');
      setTexturesLoaded(true);
    },
    (error) => {
      console.warn('Erreur chargement texture diffuse:', error);
      setHasTextureError(true);
    }
  );

  const roughnessTexture = useTexture('/assets/textures/path/sandstone_cracks_rough_4k.jpg');
  const displacementTexture = useTexture('/assets/textures/path/sandstone_cracks_disp_4k.png');

  // Configuration des textures dans useEffect
  useEffect(() => {
    if (diffuseTexture && roughnessTexture && displacementTexture && !hasTextureError) {
      [diffuseTexture, roughnessTexture, displacementTexture].forEach(texture => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1); // Pas de répétition automatique, géré par les UVs
        texture.minFilter = THREE.LinearMipMapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = 16;
        texture.flipY = false;
      });
      
      console.log('Textures configurées avec succès');
    }
  }, [diffuseTexture, roughnessTexture, displacementTexture, hasTextureError]);

  // Matériau PBR de grès fissuré pour tous les chemins
  const materials = useMemo(() => {
    const baseMaterial = {
      map: texturesLoaded ? diffuseTexture : null,
      normalMap: texturesLoaded ? null : null,
      roughnessMap: texturesLoaded ? roughnessTexture : null,
      displacementMap: texturesLoaded ? displacementTexture : null,
      displacementScale: texturesLoaded ? 0.05 : 0, // Réduire le displacement
      normalScale: new THREE.Vector2(0.8, 0.8), // Augmenter l'effet normal
      // Couleur de base qui s'harmonise avec le marron de transition du sol
      color: texturesLoaded ? new THREE.Color(0.6, 0.45, 0.3) : new THREE.Color('#8B4513'),
      roughness: texturesLoaded ? 0.8 : 0.9,
      metalness: 0.0,
    };

    // Debug des matériaux
    console.log('État des textures dans materials:', {
      texturesLoaded,
      hasTextures: texturesLoaded,
      diffuseMap: !!diffuseTexture,
      normalMap: false,
      roughnessMap: !!roughnessTexture,
      displacementMap: !!displacementTexture
    });

    return {
      // Tous les types utilisent le même matériau grès pour le moment
      dirt: new THREE.MeshStandardMaterial({
        ...baseMaterial,
      }),
      stone: new THREE.MeshStandardMaterial({
        ...baseMaterial,
        roughness: texturesLoaded ? 0.9 : 0.8,
      }),
      road: new THREE.MeshStandardMaterial({
        ...baseMaterial,
        roughness: texturesLoaded ? 0.7 : 0.7,
      })
    };
  }, [texturesLoaded, diffuseTexture, roughnessTexture, displacementTexture]);

  // Générer les géométries des chemins
  const pathMeshes = useMemo(() => {
    return paths.map((pathData, index) => {
      const path = new Path(pathData.type, pathData.points, pathData.width, pathData.material);
      const geometry = path.generateGeometry();
      const material = materials[path.material] || materials.dirt;
      
      return {
        key: `path-${index}`,
        geometry,
        material,
        path
      };
    });
  }, [paths, materials]);

  return (
    <group ref={groupRef} position={position}>
      {/* Chemins supprimés - on garde seulement l'effet de transition sur le sol */}
      {/* 
      {pathMeshes.map(({ key, geometry, material }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={material}
          receiveShadow
        />
      ))}
      */}
    </group>
  );
}

// Fonction utilitaire pour créer des chemins prédéfinis
export function createPaths() {
  return [
    // Chemin principal sinueux qui traverse le monde
    {
      type: 'road',
      material: 'dirt',
      width: 2.8,
      points: [
        new THREE.Vector2(-30, -25),
        new THREE.Vector2(-20, -18),
        new THREE.Vector2(-12, -8),
        new THREE.Vector2(-6, 2),
        new THREE.Vector2(2, 8),
        new THREE.Vector2(12, 12),
        new THREE.Vector2(20, 18),
        new THREE.Vector2(28, 25)
      ]
    },
    // Chemin secondaire avec de belles courbes
    {
      type: 'curve',
      material: 'dirt',
      width: 2.0,
      points: [
        new THREE.Vector2(-25, 5),
        new THREE.Vector2(-18, 12),
        new THREE.Vector2(-8, 15),
        new THREE.Vector2(0, 12),
        new THREE.Vector2(8, 8),
        new THREE.Vector2(15, 3),
        new THREE.Vector2(22, -2)
      ]
    },
    // Petit sentier serpentant
    {
      type: 'curve',
      material: 'dirt',
      width: 1.4,
      points: [
        new THREE.Vector2(8, -22),
        new THREE.Vector2(12, -15),
        new THREE.Vector2(16, -8),
        new THREE.Vector2(18, -2),
        new THREE.Vector2(19, 5),
        new THREE.Vector2(17, 12),
        new THREE.Vector2(13, 18),
        new THREE.Vector2(8, 22)
      ]
    },
    // Chemin en boucle naturelle
    {
      type: 'curve',
      material: 'dirt',
      width: 1.6,
      points: [
        new THREE.Vector2(-15, -15),
        new THREE.Vector2(-8, -18),
        new THREE.Vector2(0, -16),
        new THREE.Vector2(6, -12),
        new THREE.Vector2(8, -6),
        new THREE.Vector2(6, 0),
        new THREE.Vector2(0, 2),
        new THREE.Vector2(-6, 0),
        new THREE.Vector2(-10, -5),
        new THREE.Vector2(-12, -10),
        new THREE.Vector2(-15, -15)
      ]
    },
    // Sentier de montagne sinueux
    {
      type: 'curve',
      material: 'stone',
      width: 1.2,
      points: [
        new THREE.Vector2(-22, -8),
        new THREE.Vector2(-18, -5),
        new THREE.Vector2(-14, -3),
        new THREE.Vector2(-10, 0),
        new THREE.Vector2(-7, 4),
        new THREE.Vector2(-5, 8),
        new THREE.Vector2(-4, 12),
        new THREE.Vector2(-6, 16),
        new THREE.Vector2(-10, 19),
        new THREE.Vector2(-15, 20)
      ]
    }
  ];
}

// Fonction pour calculer le facteur de transition pour tous les chemins (utilisée par Grass)
export function getPathTransitionFactor(x, z, paths, transitionDistance = 1.2) {
  let minTransition = 1; // Commence avec 100% d'herbe
  
  for (const pathData of paths) {
    const path = new Path(pathData.type, pathData.points, pathData.width, pathData.material);
    const transition = path.getPathTransition(x, z, transitionDistance);
    minTransition = Math.min(minTransition, transition);
  }
  
  return minTransition;
}

// Fonction pour vérifier si une position est sur un chemin (utilisée par Grass)
export function isPositionOnPath(x, z, paths, margin = 0.5) {
  for (const pathData of paths) {
    const path = new Path(pathData.type, pathData.points, pathData.width, pathData.material);
    if (path.isOnPath(x, z, margin)) {
      return true;
    }
  }
  return false;
} 