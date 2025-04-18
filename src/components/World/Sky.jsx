import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { TEXTURE_BASE_URL, SKY_FACES } from '../../utils/const';
// n'est pas bien, je vais l'enlever

const Sky = () => {
  const { scene } = useThree();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Utiliser directement un CubeTextureLoader
    const loader = new THREE.CubeTextureLoader();
    
    // Ne pas utiliser le chemin "/public" - commencer par "assets/"
    const urls = SKY_FACES.map(name => `assets/textures/${name}`);
    
    // Ajouter des gestionnaires d'erreurs explicites
    loader.load(
      urls,
      (texture) => {
        scene.background = texture;
        setIsLoaded(true);
      },
      undefined, // progression
      (error) => {
        console.error("Erreur lors du chargement des textures skybox:", error);
        console.error("URLs tentées:", urls);
      }
    );
    
    // Cleanup function
    return () => {
      if (isLoaded) {
        scene.background = null;
      }
    };
  }, [scene]);

  // Ce composant ne rend rien directement, il modifie juste scene.background
  return null;
};

export default Sky;
