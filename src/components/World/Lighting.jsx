import { useRef, useEffect } from 'react';
import * as THREE from 'three'; // Importer THREE si ce n'est pas déjà fait

// Accepter sunPosition en prop
export default function Lighting({ sunPosition }) {
    const lightRef = useRef();

    // Utiliser un effet pour mettre à jour la position de la lumière quand sunPosition change
    useEffect(() => {
        if (lightRef.current && sunPosition) {
            // Multiplier la position normalisée du soleil pour la placer loin
            // La directionalLight brille *depuis* sa position *vers* l'origine (par défaut)
            lightRef.current.position.copy(sunPosition).normalize().multiplyScalar(20);
            // Optionnel: faire en sorte que la lumière cible un point proche de l'origine ou la caméra
            // lightRef.current.target.position.set(0, 0, 0);
            // lightRef.current.target.updateMatrixWorld();
        }
    }, [sunPosition]);

    return (
      <>
        {/* Augmenter légèrement l'intensité ambiante */}
        <ambientLight intensity={0.6} />
        <directionalLight
          ref={lightRef} // Référence pour mettre à jour la position
          // position={[10, 10, 5]} // Position gérée par useEffect
          intensity={1.2} // Augmenter un peu l'intensité du soleil
          castShadow
          shadow-mapSize-width={2048} // Augmenter la résolution des ombres
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-15} // Ajuster la zone de la caméra d'ombre si nécessaire
          shadow-camera-right={15}
          shadow-camera-top={15}
          shadow-camera-bottom={-15}
        />
        {/* <pointLight position={[-10, -10, -10]} intensity={0.5} /> Supprimer la pointLight */}
      </>
    );
  }