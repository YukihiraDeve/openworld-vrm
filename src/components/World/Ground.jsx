import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import { useFrame, useThree } from '@react-three/fiber';

// Fonction partagée pour calculer la hauteur du terrain
export function calculateHeight(x, z, frequency, amplitude) {
  return Math.sin(x * frequency) * Math.cos(z * frequency) * amplitude;
}

export default function Ground() {
  const groundSize = 100; // Increased size
  const amplitude = 1;    // Height of the hills
  const frequency = 0.1;  // How spread out the hills are
  
  const { camera } = useThree();
  const meshRef = useRef();
  
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

      // Modifier les hauteurs des vertices
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        positions[i + 2] = calculateHeight(x, y, frequency, amplitude);
      }

      geom.attributes.position.needsUpdate = true;
      geom.computeVertexNormals();
      return geom;
    });
  }, [groundSize, frequency, amplitude, lodLevels]);
  
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
        >
          <meshStandardMaterial color="#172F00" />
        </mesh>
      </RigidBody>
    </>
  );
}