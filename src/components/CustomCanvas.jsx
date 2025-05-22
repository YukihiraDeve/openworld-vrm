import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Stats, PerformanceMonitor } from '@react-three/drei';

import { Physics } from '@react-three/rapier';
import Ground from './World/Ground';
import Environment from './World/Enviroment';
import Player from '../experience/Player';
import { MultiplayerContext } from '../experience/multiplayer/MultiplayerContext';
import RemotePlayer from '../experience/multiplayer/RemotePlayer';
import Grass from './World/Grass';
import Sky from './World/Sky';
import Fog from './World/Fog';
import { SOUNDS } from '../utils/const';
import BackgroundMusic from './audio/BackgroundMusic';

// Remettre les chemins des sons ici
const stepSoundPaths = [
  `${SOUNDS.grassStep}/Step1.mp3`,
  `${SOUNDS.grassStep}/Step2.mp3`,
  `${SOUNDS.grassStep}/Step3.mp3`,
  `${SOUNDS.grassStep}/Step4.mp3`,
  `${SOUNDS.grassStep}/Step5.mp3`,
];

// Paramètres du terrain partagés entre le sol et l'herbe
const TERRAIN_CONFIG = {
  size: 100,
  amplitude: 1,
  frequency: 0.1
};

// Composant interne pour gérer l'audio et le rendu
function SceneContent({ sunPosition, setSunPosition }) {
  const { camera } = useThree(); // Utiliser useThree ici car on est dans le Canvas
  const { players, localPlayerId } = useContext(MultiplayerContext);
  const [qualityLevel, setQualityLevel] = useState(1); // 0:low, 1:medium, 2:high
  
  // Ref pour la position du joueur (pour optimiser l'herbe)
  const playerPositionRef = useRef(new THREE.Vector3(0, 0, 0));
  
  // Logique audio déplacée ici
  const [audioListener, setAudioListener] = useState(null);
  const stepSoundBuffers = useRef([]); // Utiliser useRef ici est suffisant

  // Initialiser l'AudioListener
  useEffect(() => {
    const listener = new THREE.AudioListener();
    camera.add(listener); 
    setAudioListener(listener);


    // Charger les sons
    const audioLoader = new THREE.AudioLoader();
    const loadPromises = stepSoundPaths.map(path => 
      new Promise((resolve, reject) => {
        audioLoader.load(path, buffer => {
          console.log(`Son chargé: ${path} (depuis CustomCanvas)`);
          resolve(buffer);
        }, undefined, err => {
          console.error(`Erreur de chargement du son ${path}:`, err);
          reject(err);
        });
      })
    );

    Promise.all(loadPromises)
      .then(buffers => {
        stepSoundBuffers.current = buffers;
        console.log("Tous les sons de pas chargés (depuis CustomCanvas).");
      })
      .catch(error => {
        console.error("Erreur lors du chargement d'un ou plusieurs sons:", error);
      });

    return () => {
      if (camera && listener && listener.parent === camera) {
        camera.remove(listener);
      }
    };
  }, [camera]);

  const playerKey = useMemo(() => "local-player-" + Math.random().toString(36).substring(2, 9), []);
  
  // Ajuster les paramètres de qualité en fonction des performances
  const handlePerformanceChange = useCallback(({ factor }) => {
    // factor va de 0 (mauvaises performances) à 1 (excellentes performances)
    if (factor < 0.5) {
      setQualityLevel(0); // Basse qualité
    } else if (factor < 0.8) {
      setQualityLevel(1); // Qualité moyenne
    } else {
      setQualityLevel(2); // Haute qualité
    }
  }, []);

  // Calculer les paramètres d'herbe en fonction du niveau de qualité
  const grassParams = useMemo(() => {
    const baseParams = {
      position: [0, 0, 0],
      amplitude: TERRAIN_CONFIG.amplitude,
      frequency: TERRAIN_CONFIG.frequency,
      width: TERRAIN_CONFIG.size,
      height: TERRAIN_CONFIG.size
    };
    
    // Ajuster la densité et les niveaux LOD selon la qualité
    switch (qualityLevel) {
      case 0: // Basse qualité
        return {
          ...baseParams,
          maxDensity: 300000,
          lodLevels: [
            { distance: 0, density: 1.0 },   // Distance 0-10: densité 100%
            { distance: 10, density: 1.0 },  // Distance 10: toujours 100%
            { distance: 15, density: 0.9 },  // Distance 15: densité 90%
            { distance: 20, density: 0.8 },  // Distance 20: densité 80%
            { distance: 25, density: 0.7 },  // Distance 25: densité 70%
            { distance: 30, density: 0.6 },  // Distance 30: densité 60%
            { distance: 35, density: 0.4 },  // Distance 35: densité 40%
            { distance: 40, density: 0.2 },  // Distance 40: densité 20%
            { distance: 45, density: 0.1 }   // Distance 45+: densité 10%
          ]
        };
      case 2: // Haute qualité
        return {
          ...baseParams,
          maxDensity: 800000,
          lodLevels: [
            { distance: 0, density: 1.0 },    // Distance 0-10: densité 100%
            { distance: 10, density: 1.0 },   // Distance 10: toujours 100%
            { distance: 15, density: 0.9 },   // Distance 15: densité 90%
            { distance: 20, density: 0.8 },   // Distance 20: densité 80%
            { distance: 25, density: 0.7 },   // Distance 25: densité 70%
            { distance: 30, density: 0.6 },   // Distance 30: densité 60%
            { distance: 35, density: 0.5 },   // Distance 35: densité 50%
            { distance: 40, density: 0.4 },   // Distance 40: densité 40%
            { distance: 45, density: 0.3 },   // Distance 45: densité 30%
            { distance: 50, density: 0.2 },   // Distance 50: densité 20%
            { distance: 55, density: 0.1 }    // Distance 55+: densité 10%
          ]
        };
      default: // Qualité moyenne (par défaut)
        return {
          ...baseParams,
          maxDensity: 600000,
          lodLevels: [
            { distance: 0, density: 1.0 },    // Distance 0-10: densité 100%
            { distance: 10, density: 1.0 },   // Distance 10: toujours 100%
            { distance: 15, density: 0.9 },   // Distance 15: densité 90%
            { distance: 20, density: 0.8 },   // Distance 20: densité 80%
            { distance: 25, density: 0.7 },   // Distance 25: densité 70%
            { distance: 30, density: 0.6 },   // Distance 30: densité 60%
            { distance: 35, density: 0.5 },   // Distance 35: densité 50%
            { distance: 40, density: 0.4 },   // Distance 40: densité 40%
            { distance: 45, density: 0.3 },   // Distance 45: densité 30%
            { distance: 50, density: 0.1 }    // Distance 50+: densité 10%
          ]
        };
    }
  }, [qualityLevel, TERRAIN_CONFIG]);
  
  // Paramètres de brouillard adaptés à la qualité
  const fogParams = useMemo(() => {
    switch (qualityLevel) {
      case 0: // Basse qualité - brouillard plus proche pour masquer la distance
        return { 
          baseNear: 15, 
          baseFar: 80, 
          adaptationSpeed: 0.03, // Réduire la vitesse pour des transitions plus douces
          dynamicFog: true 
        };
      case 2: // Haute qualité - brouillard plus lointain
        return { 
          baseNear: 30, 
          baseFar: 150, 
          adaptationSpeed: 0.02, // Très lent pour une stabilité maximale
          dynamicFog: true 
        };
      default: // Qualité moyenne
        return { 
          baseNear: 20, 
          baseFar: 100, 
          adaptationSpeed: 0.025, // Valeur intermédiaire
          dynamicFog: true 
        };
    }
  }, [qualityLevel]);

  return (
    <>
      <PerformanceMonitor onIncline={handlePerformanceChange} onDecline={handlePerformanceChange} />
      
      {/* Ajouter la musique de fond ici, elle a besoin de l'audioListener */}
      {audioListener && <BackgroundMusic audioListener={audioListener} />}
      
      {/* Sky and procedural clouds */}
      <Sky
        sunPosition={[5, 12, -8]}
        sunSize={1}
        sunColor='#fff3a0'
        ambientIntensity={0.65}
        preset='noon'
      />
      
      {/* Ajouter le brouillard ici avec les paramètres adaptés */}
      <Fog color="#a0c1ea" {...fogParams} />

      <Suspense fallback={null}>
        <Grass {...grassParams} playerPositionRef={playerPositionRef} />
      </Suspense>

      {/* Physics avec gravité configurée */}
      <Physics 
        gravity={[0, -9.81, 0]} 
        debug={false}
        interpolate={true}
        colliders={false}
      >
        {/* Terrain OBJ */}
        <Environment />
        
        {/* Terrain procédural */}
        <Ground />
        
        {/* Player local - Rendu dès que l'audioListener est prêt */}
        {audioListener && (
          <Player 
            key={playerKey} // Assurer une clé unique
            audioListener={audioListener}
            // Passer la ref, le composant Player gérera si les buffers sont prêts
            stepSoundBuffers={stepSoundBuffers}
            playerPositionRef={playerPositionRef}
          />
        )}
        
        {/* Joueurs distants - Rendu aussi dès que l'audioListener est prêt */}
        {/* Assurer que 'players' existe avant de mapper */}
        {audioListener && players && Object.entries(players).map(([id, playerData]) => {
            if (id === localPlayerId) return null;
            // Vérifier si playerData et locomotion existent
            const remoteLocomotion = playerData?.locomotion || 'idle'; 
            return (
              <RemotePlayer 
                key={id} 
                playerData={playerData} 
                audioListener={audioListener}
                // Passer la ref, le composant RemotePlayer gérera si les buffers sont prêts
                stepSoundBuffers={stepSoundBuffers} 
                locomotion={remoteLocomotion} // Passer la locomotion distante
              />
            );
          })}
        
      </Physics>
    </>
  );
}

export default function CustomCanvas({ sunPosition, setSunPosition, children }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 5, 10], fov: 50 }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        gl={{ 
          antialias: true,
          powerPreference: 'high-performance',
          precision: 'highp',
          // Activer physicallyCorrectLights pour un meilleur rendu
          physicallyCorrectLights: true
        }}
      >
        {/* Rendre le composant interne qui a accès au contexte du Canvas */}
        <SceneContent sunPosition={sunPosition} setSunPosition={setSunPosition} />
        
        {/* Rendre les enfants ici (y compris <Stats />) */}
        {children} 

      </Canvas>
    </div>
  );
}