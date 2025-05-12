import React, { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Fog Component
 * 
 * Ajoute un brouillard linéaire à la scène pour adoucir le rendu 
 * et améliorer l'ambiance.
 * 
 * Props:
 *  - color (string | THREE.Color): Couleur du brouillard. Défaut: '#a0c1ea' (bleu ciel clair)
 *  - baseFar (number): Distance de base pour le calcul de la densité du brouillard. Défaut: 150
 *  - baseNear (number): Distance de base où le brouillard commence. Défaut: 10
 *  - dynamicFog (boolean): Activer ou non le brouillard dynamique. Défaut: true
 *  - adaptationSpeed (number): Vitesse d'adaptation du brouillard (0-1). Défaut: 0.05
 */
export default function Fog({ 
  color = '#a0c1ea', 
  baseNear = 10, 
  baseFar = 150,
  dynamicFog = true,
  adaptationSpeed = 0.05
}) {
  const { scene, camera } = useThree();
  const currentNear = useRef(baseNear);
  const currentFar = useRef(baseFar);
  const heightThreshold = useRef(5); // Hauteur à partir de laquelle le brouillard s'éclaircit
  const lastUpdateTime = useRef(0);
  const lastCameraPosition = useRef(new THREE.Vector3());
  
  // Seuil de mouvement de caméra pour déclencher une mise à jour du brouillard
  const cameraMovementThreshold = 0.5;

  React.useEffect(() => {
    // Créer le brouillard avec les valeurs initiales
    scene.fog = new THREE.Fog(color, baseNear, baseFar);
    
    // Initialiser la position de la caméra
    lastCameraPosition.current.copy(camera.position);
    
    return () => {
      scene.fog = null; 
    };
  }, [scene, color, baseNear, baseFar, camera]);

  // Adapter le brouillard en fonction de la position de la caméra
  useFrame(({ clock }) => {
    if (!dynamicFog || !scene.fog) return;
    
    // Limiter la fréquence de mise à jour pour éviter les micro-ajustements
    const now = clock.getElapsedTime();
    const updateInterval = 0.1; // Limiter à 10 mises à jour par seconde maximum
    
    // Vérifier si la caméra a bougé significativement
    const hasCameraMoved = lastCameraPosition.current.distanceToSquared(camera.position) > cameraMovementThreshold;
    
    // Ne mettre à jour que si le temps est écoulé ou si la caméra a bougé significativement
    if (now - lastUpdateTime.current < updateInterval && !hasCameraMoved) {
      return;
    }
    
    // Facteurs d'ajustement en fonction de la hauteur de la caméra
    let heightFactor = 1.0;
    
    if (camera.position.y > heightThreshold.current) {
      // Réduire la densité du brouillard quand on est en hauteur (vue aérienne)
      const excess = camera.position.y - heightThreshold.current;
      
      // Limiter l'effet maximum pour éviter des changements extrêmes
      const maxExcessEffect = 10; // Limite de l'effet d'altitude
      const cappedExcess = Math.min(excess, maxExcessEffect); 
      
      heightFactor = 1.0 + (cappedExcess * 0.05); // Augmenter progressivement, mais plus lentement
    }
    
    // Calculer les nouvelles valeurs cibles
    const targetNear = baseNear * heightFactor;
    const targetFar = baseFar * heightFactor;
    
    // Réduire encore la vitesse d'adaptation pour des transitions plus douces
    // Utiliser un facteur d'amortissement plus fort quand on monte pour éviter les transitions brusques
    const actualAdaptationSpeed = camera.position.y > lastCameraPosition.current.y 
      ? adaptationSpeed * 0.7  // Plus lent quand on monte (évite les "pop" de brouillard)
      : adaptationSpeed;
    
    // Interpolation douce vers les valeurs cibles
    currentNear.current += (targetNear - currentNear.current) * actualAdaptationSpeed;
    currentFar.current += (targetFar - currentFar.current) * actualAdaptationSpeed;
    
    // Mettre à jour le brouillard
    scene.fog.near = currentNear.current;
    scene.fog.far = currentFar.current;
    
    // Mettre à jour les références
    lastUpdateTime.current = now;
    lastCameraPosition.current.copy(camera.position);
  });

  // Ce composant n'affiche rien directement, il configure la scène
  return null; 
}

// Alternative utilisant la syntaxe R3F déclarative (peut être plus simple si fixe)
/*
export default function Fog({ color = '#a0c1ea', near = 10, far = 150 }) {
  return <fog attach="fog" args={[color, near, far]} />;
}
*/ 