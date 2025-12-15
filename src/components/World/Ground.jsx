import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { getPathTransitionFactor, Path } from './Paths';

// Fonction partagée pour calculer la hauteur du terrain
export function calculateHeight(x, z, frequency, amplitude) {
  return Math.sin(x * frequency) * Math.cos(z * frequency) * amplitude;
}

// Générer une texture de masque pour les chemins avec Canvas
function generatePathMask(paths, size = 100, resolution = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');

  // Fond blanc (masque 1.0 = herbe)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, resolution, resolution);

  // Configurer la transformation pour matcher le monde (-size/2 à size/2)
  ctx.translate(resolution / 2, resolution / 2);
  const scale = resolution / size;
  ctx.scale(scale, scale);

  // Pour chaque chemin, dessiner en noir (masque 0.0 = chemin)
  paths.forEach(pathData => {
    // Configurer le flou pour le "fondu"
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 15; // Flou doux
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Dessiner le chemin principal
    ctx.beginPath();

    // Utiliser la logique de lissage de la classe Path ou des courbes quadratiques simples
    // Ici on réutilise la classe Path pour garantir la cohérence
    const pathInstance = new Path(pathData.type, pathData.points, pathData.width, pathData.material);
    const smoothPoints = pathInstance.points; // Points lissés générés par Catmull-Rom

    if (smoothPoints.length < 2) return;

    ctx.moveTo(smoothPoints[0].x, smoothPoints[0].y);

    // Tracer les segments entre les points lissés
    for (let i = 1; i < smoothPoints.length; i++) {
      ctx.lineTo(smoothPoints[i].x, smoothPoints[i].y);
    }

    // Largeur du chemin + marge de transition
    ctx.lineWidth = pathData.width * 1.5;
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    // Deuxième passe pour le cœur du chemin (plus noir)
    ctx.shadowBlur = 5;
    ctx.lineWidth = pathData.width;
    ctx.stroke();
  });

  return new THREE.CanvasTexture(canvas);
}

export default function Ground({ paths = [], pathDetailTexture = null, baseTexture = null }) {
  const groundSize = 100; // Increased size
  const amplitude = 1;    // Height of the hills
  const frequency = 0.1;  // How spread out the hills are

  const { camera } = useThree();
  const meshRef = useRef();

  // Charger la texture de détail optionnelle pour les chemins
  const detailTexture = pathDetailTexture ? useTexture(pathDetailTexture) : null;

  // Charger la texture de base optionnelle pour le sol
  const groundTexture = baseTexture ? useTexture(baseTexture) : null;

  // Configurer la texture de détail si elle existe
  if (detailTexture) {
    detailTexture.wrapS = detailTexture.wrapT = THREE.RepeatWrapping;
    detailTexture.repeat.set(8, 8); // Répéter la texture pour plus de détail
  }

  // Configurer la texture de base si elle existe
  if (groundTexture) {
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(16, 16); // Répéter la texture de base plus pour plus de finesse
  }

  // Configuration des niveaux de détail pour le terrain avec des distances plus progressives
  const lodLevels = useMemo(() => [
    { distance: 0, segments: 100 },    // Près: haute qualité
    { distance: 25, segments: 80 },    // Moyenne distance: qualité moyenne
    { distance: 50, segments: 60 },    // Distance moyenne-lointaine: qualité basse
    { distance: 75, segments: 40 },    // Distance lointaine: qualité très basse
  ], []);

  // Référence au niveau LOD actuel et facteur de transition
  const currentLOD = useRef(0);
  const transitionFactor = useRef(0); // 0 = premier LOD, 1 = second LOD
  const lastDistanceUpdate = useRef(0);

  // Générer la texture de masque path une seule fois
  const pathMaskTexture = useMemo(() => {
    return generatePathMask(paths, groundSize);
  }, [paths, groundSize]);


  // La géométrie par défaut initiale (la plus haute qualité)
  const geometries = useMemo(() => {
    return lodLevels.map(level => {
      const geom = new THREE.PlaneGeometry(groundSize, groundSize, level.segments, level.segments);
      const positions = geom.attributes.position.array;

      // Modifier les hauteurs des vertices
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = calculateHeight(x, y, frequency, amplitude);
        positions[i + 2] = z;
      }

      geom.attributes.position.needsUpdate = true;
      geom.computeVertexNormals();
      return geom;
    });
  }, [groundSize, frequency, amplitude, lodLevels]);

  // Matériau personnalisé avec transition de couleur via texture
  const groundMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: '#172F00',
    });

    material.onBeforeCompile = (shader) => {
      // Injecter la texture de masque
      shader.uniforms.pathMask = { value: pathMaskTexture };

      if (detailTexture) {
        shader.uniforms.detailTexture = { value: detailTexture };
      }

      if (groundTexture) {
        shader.uniforms.groundTexture = { value: groundTexture };
      }

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPosition;
        varying vec2 vDetailUv;
        varying vec2 vGroundUv;
        varying vec2 vMaskUv;` // UV global pour le masque
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPosition = position;
        vMaskUv = uv; // UV 0-1 standard du plan
        vDetailUv = uv * 8.0;
        vGroundUv = uv * 16.0;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPosition;
        varying vec2 vDetailUv;
        varying vec2 vGroundUv;
        varying vec2 vMaskUv;
        uniform sampler2D pathMask;
        ${detailTexture ? 'uniform sampler2D detailTexture;' : ''}
        ${groundTexture ? 'uniform sampler2D groundTexture;' : ''}`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        
        // Lire le masque de chemin (0 = chemin, 1 = herbe)
        // Texture créée via Canvas, lissée par défaut
        float transitionFactor = texture2D(pathMask, vMaskUv).r;
        
        // Couleurs
        vec3 grassColorBase = vec3(0.05, 0.12, 0.02);
        vec3 dirtColor = vec3(0.4, 0.3, 0.2);
        
        ${groundTexture ? `
        vec3 groundSample = texture2D(groundTexture, vGroundUv).rgb;
        vec3 grassColor = mix(grassColorBase, grassColorBase * groundSample * 1.8, 0.7);
        ` : `
        vec3 grassColor = grassColorBase;
        `}
        
        ${detailTexture ? `
        vec3 detailSample = texture2D(detailTexture, vDetailUv).rgb;
        // La texture de détail apparaît sur le chemin
        float detailStrength = (1.0 - transitionFactor) * 0.8;
        vec3 texturedDirt = mix(dirtColor, dirtColor * detailSample * 1.5, detailStrength);
        
        vec3 finalColor = mix(texturedDirt, grassColor, transitionFactor);
        ` : `
        vec3 finalColor = mix(dirtColor, grassColor, transitionFactor);
        `}
        
        // Variation de hauteur
        float heightVariation = sin(vPosition.x * 0.1) * sin(vPosition.z * 0.1) * 0.1 + 1.0;
        finalColor *= heightVariation;
        
        diffuseColor.rgb = finalColor;`
      );
    };

    return material;
  }, [detailTexture, groundTexture, pathMaskTexture]);

  // Déplacements de la caméra - pour éviter les mises à jour trop fréquentes
  const lastCameraPosition = useRef(new THREE.Vector3());
  const movementThreshold = 0.5; // Distance minimale de déplacement avant mise à jour

  // Changer de LOD en fonction de la distance avec transitions douces
  useFrame(() => {
    if (!meshRef.current) return;

    // Vérifier si la caméra a bougé suffisamment pour recalculer le LOD
    if (lastCameraPosition.current.distanceToSquared(camera.position) < movementThreshold) {
      return; // Éviter les recalculs inutiles si la caméra n'a pas bougé significativement
    }

    // Mettre à jour la position de la caméra mémorisée
    lastCameraPosition.current.copy(camera.position);

    // Calculer la distance entre la caméra et le centre du terrain
    const center = new THREE.Vector3(0, 0, 0);
    const distanceToCamera = camera.position.distanceTo(center);

    // Trouver l'indice du LOD approprié
    let targetLODIndex = 0;

    for (let i = 0; i < lodLevels.length - 1; i++) {
      if (distanceToCamera >= lodLevels[i].distance && distanceToCamera < lodLevels[i + 1].distance) {
        targetLODIndex = i;

        // Calculer un facteur de transition entre ce niveau et le suivant
        const range = lodLevels[i + 1].distance - lodLevels[i].distance;
        transitionFactor.current = (distanceToCamera - lodLevels[i].distance) / range;
        break;
      }
    }

    // Si on est au-delà du dernier seuil
    if (distanceToCamera >= lodLevels[lodLevels.length - 1].distance) {
      targetLODIndex = lodLevels.length - 1;
      transitionFactor.current = 1;
    }

    // Ne changer le LOD que si nécessaire et avec un délai minimal
    const now = performance.now();
    const minUpdateInterval = 500; // Minimum 500ms entre changements de LOD

    if (targetLODIndex !== currentLOD.current &&
      now - lastDistanceUpdate.current > minUpdateInterval) {

      // Transition douce: sauvegarder temporairement l'ancienne et la nouvelle géométrie
      const oldGeom = meshRef.current.geometry;
      const newGeom = geometries[targetLODIndex];

      // Appliquer la nouvelle géométrie
      meshRef.current.geometry = newGeom;

      // Mise à jour des références
      currentLOD.current = targetLODIndex;
      lastDistanceUpdate.current = now;
    }
  });

  return (
    <>
      <RigidBody type="fixed" colliders="trimesh">
        {/* Visual mesh with LOD */}
        <mesh
          ref={meshRef}
          geometry={geometries[0]} // Commencer avec la meilleure qualité
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          receiveShadow
          material={groundMaterial}
        />
      </RigidBody>
    </>
  );
}