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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (onLoadComplete) onLoadComplete();
  }, [onLoadComplete]);

  return (
    <>
      {children}
    </>
  );
} 