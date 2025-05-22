import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';

// Composant d'écran de chargement avec Html de drei
function LoadingScreen({ progress }) {
  return (
    <Html prepend fullscreen>
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
        <h2>Chargement du terrain...</h2>
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
    </Html>
  );
}

export default function Environment() {
  const terrainRef = useRef();
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Fonction pour suivre la progression du chargement
    const onProgress = (xhr) => {
      if (xhr.lengthComputable) {
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        setProgress(percentComplete);
      }
    };

    // Chargement du fichier MTL puis du modèle OBJ
    const mtlLoader = new MTLLoader();
    mtlLoader.load(
      '/assets/world/Terrain.mtl',
      (materials) => {
        materials.preload();
        
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        
        // Chargement du modèle OBJ avec les matériaux
        objLoader.load(
          '/assets/world/Terrain.obj',
          (object) => {
            // Personnalisation du modèle chargé
            object.traverse(function(child) {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Appliquer un matériau par défaut seulement si nécessaire
                if (!child.material) {
                  child.material = new THREE.MeshStandardMaterial({ 
                    color: '#172F00', 
                    roughness: 0.8, 
                    metalness: 0.2 
                  });
                }
              }
            });
            
            setModel(object);
            setLoading(false);
          },
          onProgress,
          (error) => {
            console.error('Une erreur est survenue lors du chargement du terrain:', error);
            setLoading(false);
          }
        );
      },
      undefined,
      (error) => {
        console.error('Une erreur est survenue lors du chargement des matériaux MTL:', error);
        
        // Chargement du modèle OBJ sans matériaux en cas d'échec du MTL
        const objLoader = new OBJLoader();
        objLoader.load(
          '/assets/world/Terrain.obj',
          (object) => {
            object.traverse(function(child) {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.material = new THREE.MeshStandardMaterial({ 
                  color: '#172F00', 
                  roughness: 0.8, 
                  metalness: 0.2 
                });
              }
            });
            
            setModel(object);
            setLoading(false);
          },
          onProgress,
          (error) => {
            console.error('Une erreur est survenue lors du chargement du terrain:', error);
            setLoading(false);
          }
        );
      }
    );
  }, []);

  return (
    <>
      {loading && <LoadingScreen progress={progress} />}
      
      {model && (
        <RigidBody type="fixed" colliders="trimesh">
          <primitive 
            ref={terrainRef}
            object={model} 
            position={[0, -10, 0]}
            scale={[0.1, 0.1, 0.1]} 
          />
        </RigidBody>
      )}
    </>
  );
}
