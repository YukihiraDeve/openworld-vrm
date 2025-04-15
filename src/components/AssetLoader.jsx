import React, { useState, useEffect } from 'react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { MODELS, ANIMATIONS } from '../utils/const';

// Composant d'animation de chargement
function LoadingScreen({ progress }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      color: 'white'
    }}>
      <h2>Chargement des assets...</h2>
      <div style={{
        width: '300px',
        height: '20px',
        backgroundColor: '#333',
        borderRadius: '10px',
        overflow: 'hidden',
        margin: '20px 0'
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          backgroundColor: '#4CAF50',
          transition: 'width 0.3s ease'
        }}></div>
      </div>
      <p>{Math.round(progress)}%</p>
    </div>
  );
}

export default function AssetLoader({ children, onLoadComplete }) {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const totalAssets = Object.keys(MODELS).length + Object.keys(ANIMATIONS).length;
    let loadedAssets = 0;

    // Fonction pour mettre à jour la progression
    const updateProgress = () => {
      loadedAssets++;
      setProgress((loadedAssets / totalAssets) * 100);
      
      if (loadedAssets === totalAssets) {
        setTimeout(() => {
          setLoading(false);
          if (onLoadComplete) onLoadComplete();
        }, 500); // Petit délai pour assurer que tout est prêt
      }
    };

    // Préchargement des modèles VRM
    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
    
    Object.values(MODELS).forEach(modelUrl => {
      gltfLoader.load(modelUrl, 
        () => updateProgress(),
        undefined, // Progression (optionnel)
        (error) => console.error(`Erreur lors du chargement du modèle ${modelUrl}:`, error)
      );
    });

    // Préchargement des animations FBX
    const fbxLoader = new FBXLoader();
    
    Object.values(ANIMATIONS).forEach(animUrl => {
      fbxLoader.load(animUrl,
        () => updateProgress(),
        undefined, // Progression (optionnel)
        (error) => console.error(`Erreur lors du chargement de l'animation ${animUrl}:`, error)
      );
    });

  }, [onLoadComplete]);

  return (
    <>
      {loading && <LoadingScreen progress={progress} />}
      {children}
    </>
  );
} 