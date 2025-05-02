import React from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Fog Component
 * 
 * Ajoute un brouillard linéaire à la scène pour adoucir le rendu 
 * et améliorer l'ambiance.
 * 
 * Props:
 *  - color (string | THREE.Color): Couleur du brouillard. Défaut: '#a0c1ea' (bleu ciel clair)
 *  - near (number): Distance minimale de la caméra où le brouillard commence. Défaut: 10
 *  - far (number): Distance maximale où le brouillard atteint sa pleine densité. Défaut: 150
 */
export default function Fog({ color = '#a0c1ea', near = 10, far = 150 }) {
  const { scene } = useThree();

  React.useEffect(() => {
    scene.fog = new THREE.Fog(color, near, far);
    // Nettoyage lorsque le composant est démonté ou que les props changent
    return () => {
      scene.fog = null; 
    };
  }, [scene, color, near, far]); // Recrée le brouillard si les props changent

  // Ce composant n'affiche rien directement, il configure la scène
  return null; 
}

// Alternative utilisant la syntaxe R3F déclarative (peut être plus simple si fixe)
/*
export default function Fog({ color = '#a0c1ea', near = 10, far = 150 }) {
  return <fog attach="fog" args={[color, near, far]} />;
}
*/ 