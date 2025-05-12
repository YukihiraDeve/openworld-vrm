import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useState, useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function FollowCamera({ targetRef, angle }) {
  const { camera } = useThree();
  const [zoom, setZoom] = useState(5);
  const minZoom = 2;
  const maxZoom = 10;
  const lookAtOffset = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  
  // Références pour les positions et lookAt
  const currentLookAt = useRef(new THREE.Vector3());
  
  // Paramètres d'interpolation - plus réactifs
  const followSpeed = 0.5; // Valeur plus élevée = suivi plus réactif (0-1)
  const lookAtSpeed = 0.7; // Vitesse de rotation du regard (0-1)

  useEffect(() => {
    // Initialisation de la position cible au démarrage
    if (targetRef && targetRef.current) {
      const pos = new THREE.Vector3();
      targetRef.current.getWorldPosition(pos);
      
      // Initialiser le lookAt
      const lookAtPos = pos.clone().add(lookAtOffset);
      currentLookAt.current.copy(lookAtPos);
      
      // Positionner la caméra directement au début
      const initialPosition = new THREE.Vector3();
      initialPosition.x = pos.x + zoom * Math.sin(angle.horizontal) * Math.cos(angle.vertical);
      initialPosition.y = pos.y + zoom * Math.sin(angle.vertical) + lookAtOffset.y;
      initialPosition.z = pos.z + zoom * Math.cos(angle.horizontal) * Math.cos(angle.vertical);
      camera.position.copy(initialPosition);
      camera.lookAt(lookAtPos);
    }
    
    const handleWheel = (e) => {
      setZoom((prev) => {
        // Zoom sensibilité équilibrée
        const zoomSpeed = 0.008;
        const newZoom = prev + e.deltaY * zoomSpeed;
        return Math.max(minZoom, Math.min(maxZoom, newZoom));
      });
    };
    
    window.addEventListener('wheel', handleWheel);
    return () => window.removeEventListener('wheel', handleWheel);
  }, [targetRef, lookAtOffset, camera, zoom, angle]);

  useFrame(() => {
    if (!targetRef || !targetRef.current) return;
    
    // Position actuelle du joueur
    const targetPosition = new THREE.Vector3();
    targetRef.current.getWorldPosition(targetPosition);
    
    // Calculer la position désirée de la caméra
    const desiredCameraPosition = new THREE.Vector3();
    desiredCameraPosition.x = targetPosition.x + zoom * Math.sin(angle.horizontal) * Math.cos(angle.vertical);
    desiredCameraPosition.y = targetPosition.y + zoom * Math.sin(angle.vertical) + lookAtOffset.y;
    desiredCameraPosition.z = targetPosition.z + zoom * Math.cos(angle.horizontal) * Math.cos(angle.vertical);
    
    // Interpolation simple mais efficace pour réduire les tremblements
    // Valeur plus élevée = suivi plus direct
    camera.position.lerp(desiredCameraPosition, followSpeed);
    
    // Point de visée avec légère interpolation
    const desiredLookAt = targetPosition.clone().add(lookAtOffset);
    currentLookAt.current.lerp(desiredLookAt, lookAtSpeed);
    
    // Faire regarder la caméra vers ce point
    camera.lookAt(currentLookAt.current);
  });

  return null;
}