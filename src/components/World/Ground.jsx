import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { getPathTransitionFactor } from './Paths';

// Fonction partagée pour calculer la hauteur du terrain
export function calculateHeight(x, z, frequency, amplitude) {
  return Math.sin(x * frequency) * Math.cos(z * frequency) * amplitude;
}

export default function Ground({ paths = [], pathDetailTexture = null }) {
  const groundSize = 100; // Increased size
  const amplitude = 1;    // Height of the hills
  const frequency = 0.1;  // How spread out the hills are
  
  const { camera } = useThree();
  const meshRef = useRef();
  
  // Charger la texture de détail optionnelle pour les chemins
  const detailTexture = pathDetailTexture ? useTexture(pathDetailTexture) : null;
  
  // Configurer la texture si elle existe
  if (detailTexture) {
    detailTexture.wrapS = detailTexture.wrapT = THREE.RepeatWrapping;
    detailTexture.repeat.set(8, 8); // Répéter la texture pour plus de détail
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
  
  // La géométrie par défaut initiale (la plus haute qualité)
  const geometries = useMemo(() => {
    return lodLevels.map(level => {
      const geom = new THREE.PlaneGeometry(groundSize, groundSize, level.segments, level.segments);
      const positions = geom.attributes.position.array;
      const colors = new Float32Array(positions.length); // Pour stocker les transitions

      // Modifier les hauteurs des vertices et calculer les transitions
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1]; // Dans PlaneGeometry, y représente la 2ème dimension du plan
        const z = calculateHeight(x, y, frequency, amplitude);
        positions[i + 2] = z; // Assigner la hauteur calculée à z
        
        // Pour les chemins, utiliser les coordonnées du plan après rotation: (x, -y)
        // Car après rotation [-π/2, 0, 0], le plan XY devient XZ avec Y inversé
        const transitionFactor = paths.length > 0 ? getPathTransitionFactor(x, -y, paths, 1.5) : 1.0;
        
        // Stocker le facteur de transition dans un attribut personnalisé
        colors[i] = transitionFactor;     // R
        colors[i + 1] = transitionFactor; // G  
        colors[i + 2] = transitionFactor; // B
      }

      geom.attributes.position.needsUpdate = true;
      geom.setAttribute('pathTransition', new THREE.Float32BufferAttribute(colors, 3));
      geom.computeVertexNormals();
      return geom;
    });
  }, [groundSize, frequency, amplitude, lodLevels, paths]);
  
  // Matériau personnalisé avec transition de couleur
  const groundMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: '#172F00', // Couleur de base (sera modifiée par le shader)
      vertexColors: true,
    });

    material.onBeforeCompile = (shader) => {
      // Ajouter la texture de détail si elle existe
      if (detailTexture) {
        shader.uniforms.detailTexture = { value: detailTexture };
      }
      
      // Ajouter l'attribut personnalisé
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        attribute vec3 pathTransition;
        varying vec3 vPathTransition;
        varying vec3 vPosition;
        varying vec2 vDetailUv;`
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPathTransition = pathTransition;
        vPosition = position;
        // UV pour la texture de détail (répétée pour plus de finesse)
        vDetailUv = uv * 8.0;`
      );

      // Modifier le fragment shader pour la transition de couleur
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPathTransition;
        varying vec3 vPosition;
        varying vec2 vDetailUv;
        ${detailTexture ? 'uniform sampler2D detailTexture;' : ''}`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        
        // Couleur de base du terrain (vert foncé)
        vec3 grassColor = vec3(0.05, 0.12, 0.02); // Vert plus sombre et naturel
        
        // Couleur de transition près des chemins (terre/sable)
        vec3 dirtColor = vec3(0.4, 0.3, 0.2); // Couleur terre
        
        // Facteur de transition (0 = chemin, 1 = herbe)
        float transitionFactor = vPathTransition.r;
        
        ${detailTexture ? `
        // Appliquer la texture de détail sur les zones de chemin
        vec3 detailSample = texture2D(detailTexture, vDetailUv).rgb;
        
        // Mélanger la texture de détail avec la couleur de terre
        // Plus on est sur un chemin (transitionFactor proche de 0), plus la texture est visible
        float detailStrength = (1.0 - transitionFactor) * 0.6; // 0.6 = intensité de la texture
        vec3 texturedDirt = mix(dirtColor, dirtColor * detailSample * 1.5, detailStrength);
        
        // Interpoler entre la terre texturée et l'herbe
        vec3 finalColor = mix(texturedDirt, grassColor, transitionFactor);
        ` : `
        // Sans texture de détail, utiliser la couleur unie
        vec3 finalColor = mix(dirtColor, grassColor, transitionFactor);
        `}
        
        // Ajouter un peu de variation selon la hauteur pour plus de réalisme
        float heightVariation = sin(vPosition.x * 0.1) * sin(vPosition.z * 0.1) * 0.1 + 1.0;
        finalColor *= heightVariation;
        
        // Remplacer la couleur diffuse
        diffuseColor.rgb = finalColor;`
      );
    };

    return material;
  }, [detailTexture]);
  
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
      if (distanceToCamera >= lodLevels[i].distance && distanceToCamera < lodLevels[i+1].distance) {
        targetLODIndex = i;
        
        // Calculer un facteur de transition entre ce niveau et le suivant
        const range = lodLevels[i+1].distance - lodLevels[i].distance;
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