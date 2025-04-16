import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Ce composant gère l'animation de la position du soleil
export default function EnvironmentController({ sunPosition, setSunPosition, isActive }) {
  const sunRef = useRef(new THREE.Vector3());
  const rotationAxis = useRef(new THREE.Vector3(1, 0, 0)).current; // Axe de rotation (Est-Ouest)
  const angleRef = useRef(0);
  const initialSunVector = useRef(new THREE.Vector3());

  // Initialiser la position du soleil dans la ref
  useEffect(() => {
    sunRef.current.copy(sunPosition);
    // Stocker le vecteur initial pour la rotation
    initialSunVector.current.copy(sunPosition).normalize();
    // Calculer l'angle initial approximatif basé sur la position Y
    // Ceci est une simplification, une meilleure approche utiliserait l'angle correct
    angleRef.current = Math.asin(sunPosition.y / sunPosition.length());

  }, [sunPosition]); // Se déclenche si la position initiale change

  useFrame((state, delta) => {
    if (isActive) {
      // Vitesse de rotation (ajuster pour la vitesse du cycle)
      const speed = delta * 0.1;

      // Mettre à jour l'angle
      angleRef.current += speed;
      angleRef.current %= (2 * Math.PI); // Garder l'angle dans [0, 2PI]

      // Calculer la nouvelle position en faisant tourner le vecteur initial
      const newPosition = initialSunVector.current.clone()
         .applyAxisAngle(rotationAxis, angleRef.current)
         .multiplyScalar(sunPosition.length()); // Conserver la distance initiale


      // Important: Créer une NOUVELLE instance de Vector3 pour déclencher la mise à jour de l'état
      // Si on modifie sunRef.current directement, React ne détecte pas le changement
      setSunPosition(new THREE.Vector3().copy(newPosition));
    }
  });

  // Ce composant ne rend rien visuellement
  return null;
} 