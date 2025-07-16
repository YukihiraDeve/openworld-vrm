import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Stats, PerformanceMonitor } from '@react-three/drei';

import { Physics } from '@react-three/rapier';
import Ground from './World/Ground';
import Player from '../experience/Player';
import { MultiplayerContext } from '../experience/multiplayer/MultiplayerContext';
import RemotePlayer from '../experience/multiplayer/RemotePlayer';
import Grass from './World/Grass';
import Bushes from './World/Bushes';
import Flowers from './World/Flowers';
import Paths, { createPaths } from './World/Paths';
import Sky from './World/Sky';
import Fog from './World/Fog';
import { SOUNDS, TEXTURES } from '../utils/const';
import BackgroundMusic from './audio/BackgroundMusic';
import { EmoteProvider, useEmoteContext } from '../context/EmoteContext';
import EmoteMenu from '../ui/EmoteMenu/EmoteMenu';

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

// Système de gestion de performance intelligent
class PerformanceManager {
  constructor() {
    this.frameTimings = [];
    this.lastUpdate = 0;
    this.currentQualityLevel = 1; // 0: low, 1: medium, 2: high
    this.qualityChangeCallbacks = [];
    this.adaptationSpeed = 0.1;
    this.targetFPS = 60;
    this.minAcceptableFPS = 25; // Réduit de 30 à 25 pour être moins agressif
    this.autoAdaptationEnabled = true; // Nouveau: permet de désactiver l'adaptation auto
  }

  addQualityChangeCallback(callback) {
    this.qualityChangeCallbacks.push(callback);
  }

  removeQualityChangeCallback(callback) {
    const index = this.qualityChangeCallbacks.indexOf(callback);
    if (index > -1) {
      this.qualityChangeCallbacks.splice(index, 1);
    }
  }

  setAutoAdaptation(enabled) {
    this.autoAdaptationEnabled = enabled;
    console.log(`Auto adaptation ${enabled ? 'enabled' : 'disabled'}`);
  }

  setQualityLevel(level) {
    if (level >= 0 && level <= 2) {
      this.currentQualityLevel = level;
      this.notifyQualityChange(level);
      console.log(`Quality manually set to: ${level}`);
    }
  }

  updatePerformance(deltaTime) {
    if (!this.autoAdaptationEnabled) {
      return; // Ne pas faire d'adaptation automatique si désactivé
    }

    const now = performance.now();
    
    // Calculer le FPS actuel
    const currentFPS = 1 / deltaTime;
    this.frameTimings.push(currentFPS);
    
    // Garder seulement les 120 dernières mesures (plus de stabilité)
    if (this.frameTimings.length > 120) {
      this.frameTimings.shift();
    }
    
    // Mise à jour toutes les 5 secondes (plus patient)
    if (now - this.lastUpdate > 5000 && this.frameTimings.length >= 60) {
      const averageFPS = this.frameTimings.reduce((a, b) => a + b, 0) / this.frameTimings.length;
      const newQualityLevel = this.calculateOptimalQuality(averageFPS);
      
      if (newQualityLevel !== this.currentQualityLevel) {
        console.log(`Auto quality change: ${this.currentQualityLevel} -> ${newQualityLevel} (avg FPS: ${averageFPS.toFixed(1)})`);
        this.currentQualityLevel = newQualityLevel;
        this.notifyQualityChange(newQualityLevel);
      }
      
      this.lastUpdate = now;
      // Vider une partie de l'historique pour éviter l'inertie
      this.frameTimings = this.frameTimings.slice(-60);
    }
  }

  calculateOptimalQuality(averageFPS) {
    // Seuils plus permissifs pour éviter les changements trop fréquents
    if (averageFPS >= this.targetFPS * 0.85) { // 85% au lieu de 90%
      return Math.min(2, this.currentQualityLevel + 1); // Permettre de remonter progressivement
    } else if (averageFPS >= this.minAcceptableFPS) {
      return 1; // Rester en qualité moyenne
    } else if (averageFPS < this.minAcceptableFPS * 0.8) { // Seulement si vraiment très bas
      return 0; // Passer en basse qualité seulement si critique
    }
    
    return this.currentQualityLevel; // Garder le niveau actuel par défaut
  }

  notifyQualityChange(qualityLevel) {
    this.qualityChangeCallbacks.forEach(callback => {
      try {
        callback(qualityLevel);
      } catch (error) {
        console.error('Error in quality change callback:', error);
      }
    });
  }

  getQualityLevel() {
    return this.currentQualityLevel;
  }
}

// Instance globale du gestionnaire de performance
const performanceManager = new PerformanceManager();

// Composant pour gérer le menu d'émotes en dehors du Canvas
function EmoteMenuManager() {
  const { 
    currentEmote, 
    isEmoteMenuOpen, 
    closeEmoteMenu, 
    triggerEmote 
  } = useEmoteContext();
  
  const { emitPlayerEmote } = useContext(MultiplayerContext);

  const handleEmoteSelect = useCallback((emote) => {
    const animationName = triggerEmote(emote);
    console.log(`Émote sélectionnée: ${emote.name} (${animationName}) - Type: ${emote.type}`);
    
    // Émettre l'émote aux autres joueurs via le multijoueur
    emitPlayerEmote({ 
      emote: emote.id, 
      type: emote.type,
      animation: animationName 
    });
  }, [triggerEmote, emitPlayerEmote]);

  return (
    <EmoteMenu
      isOpen={isEmoteMenuOpen}
      onClose={closeEmoteMenu}
      onEmoteSelect={handleEmoteSelect}
      currentEmote={currentEmote}
    />
  );
}

// Composant interne pour gérer l'audio et le rendu
function SceneContent({ sunPosition, setSunPosition }) {
  const { camera } = useThree();
  const { players, localPlayerId } = useContext(MultiplayerContext);
  const [qualityLevel, setQualityLevel] = useState(1);
  
  // Ref pour la position du joueur (pour optimiser l'herbe)
  const playerPositionRef = useRef(new THREE.Vector3(0, 0, 0));
  
  // Créer les chemins une seule fois avec cache
  const worldPaths = useMemo(() => createPaths(), []);
  
  // Logique audio optimisée
  const [audioListener, setAudioListener] = useState(null);
  const stepSoundBuffers = useRef([]);
  const audioLoadingPromise = useRef(null);

  // Performance monitoring avec throttling
  const lastPerformanceUpdate = useRef(0);

  // Initialiser l'AudioListener et charger les sons de manière asynchrone
  useEffect(() => {
    const listener = new THREE.AudioListener();
    camera.add(listener); 
    setAudioListener(listener);

    // Charger les sons en parallèle avec optimisation
    if (!audioLoadingPromise.current) {
      audioLoadingPromise.current = Promise.all(
        stepSoundPaths.map(path => 
          new Promise((resolve) => {
            const audioLoader = new THREE.AudioLoader();
            audioLoader.load(path, 
              buffer => {
                console.log(`Son chargé: ${path}`);
                resolve(buffer);
              }, 
              undefined, 
              err => {
                console.error(`Erreur de chargement du son ${path}:`, err);
                resolve(null); // Résoudre avec null plutôt que rejeter
              }
            );
          })
        )
      ).then(buffers => {
        stepSoundBuffers.current = buffers.filter(buffer => buffer !== null);
        console.log(`${stepSoundBuffers.current.length} sons de pas chargés avec succès`);
      });
    }

    return () => {
      if (camera && listener && listener.parent === camera) {
        camera.remove(listener);
      }
    };
  }, [camera]);

  // Gérer les changements de qualité
  useEffect(() => {
    const handleQualityChange = (newQualityLevel) => {
      setQualityLevel(newQualityLevel);
      console.log(`Quality level changed to: ${newQualityLevel}`);
    };

    const handleSetQualityLevel = (event) => {
      const level = event.detail;
      performanceManager.setQualityLevel(level);
      setQualityLevel(level);
    };

    const handleSetAutoAdaptation = (event) => {
      const enabled = event.detail;
      performanceManager.setAutoAdaptation(enabled);
    };

    performanceManager.addQualityChangeCallback(handleQualityChange);
    window.addEventListener('setQualityLevel', handleSetQualityLevel);
    window.addEventListener('setAutoAdaptation', handleSetAutoAdaptation);
    
    return () => {
      performanceManager.removeQualityChangeCallback(handleQualityChange);
      window.removeEventListener('setQualityLevel', handleSetQualityLevel);
      window.removeEventListener('setAutoAdaptation', handleSetAutoAdaptation);
    };
  }, []);

  const playerKey = useMemo(() => "local-player-" + Math.random().toString(36).substring(2, 9), []);
  
  // Paramètres d'herbe optimisés en fonction de la qualité
  const grassParams = useMemo(() => {
    const baseParams = {
      position: [0, 0, 0],
      amplitude: TERRAIN_CONFIG.amplitude,
      frequency: TERRAIN_CONFIG.frequency,
      width: TERRAIN_CONFIG.size,
      height: TERRAIN_CONFIG.size
    };
    
    switch (qualityLevel) {
      case 0: // Basse qualité
        return {
          ...baseParams,
          maxDensity: 800000, // Augmenté de 200k à 800k
          lodLevels: [
            { distance: 0, density: 1.0 },
            { distance: 8, density: 0 },
            { distance: 15, density: 0.6 },
            { distance: 25, density: 0.3 },
            { distance: 35, density: 0.1 }
          ]
        };
      case 2: // Haute qualité
        return {
          ...baseParams,
          maxDensity: 2000000, // Augmenté de 600k à 2M
          lodLevels: [
            { distance: 0, density: 1.0 },
            { distance: 20, density: 0 },
            { distance: 30, density: 0.9 },
            { distance: 40, density: 0.8 },
            { distance: 50, density: 0.7 },
            { distance: 60, density: 0.5 },
            { distance: 70, density: 0.3 },
            { distance: 80, density: 0.1 }
          ]
        };
      default: // Qualité moyenne
        return {
          ...baseParams,
          maxDensity: 1200000, // Augmenté de 400k à 1.2M
          lodLevels: [
            { distance: 0, density: 1.0 },
            { distance: 15, density: 0 },
            { distance: 25, density: 0.8 },
            { distance: 35, density: 0.6 },
            { distance: 45, density: 0.4 },
            { distance: 55, density: 0.2 },
            { distance: 65, density: 0.1 }
          ]
        };
    }
  }, [qualityLevel]);
  
  // Paramètres des buissons adaptés à la qualité
  const bushParams = useMemo(() => {
    const baseParams = {
      position: [0, 0, 0],
      amplitude: TERRAIN_CONFIG.amplitude,
      frequency: TERRAIN_CONFIG.frequency,
      width: TERRAIN_CONFIG.size,
      height: TERRAIN_CONFIG.size
    };
    
    switch (qualityLevel) {
      case 0: return { ...baseParams, count: 100 };
      case 2: return { ...baseParams, count: 300 };
      default: return { ...baseParams, count: 200 };
    }
  }, [qualityLevel]);
  
  // Paramètres des fleurs adaptés à la qualité
  const flowerParams = useMemo(() => {
    const baseParams = {
      position: [0, 0, 0],
      amplitude: TERRAIN_CONFIG.amplitude,
      frequency: TERRAIN_CONFIG.frequency,
      width: TERRAIN_CONFIG.size,
      height: TERRAIN_CONFIG.size
    };
    
    switch (qualityLevel) {
      case 0: return { ...baseParams, count: 50 };
      case 2: return { ...baseParams, count: 150 };
      default: return { ...baseParams, count: 100 };
    }
  }, [qualityLevel]);
  
  // Paramètres de brouillard adaptés à la qualité
  const fogParams = useMemo(() => {
    switch (qualityLevel) {
      case 0:
        return { 
          baseNear: 12, 
          baseFar: 60, 
          adaptationSpeed: 0.05,
          dynamicFog: false // Désactiver le brouillard dynamique en basse qualité
        };
      case 2:
        return { 
          baseNear: 35, 
          baseFar: 120, 
          adaptationSpeed: 0.015,
          dynamicFog: true 
        };
      default:
        return { 
          baseNear: 25, 
          baseFar: 90, 
          adaptationSpeed: 0.03,
          dynamicFog: true 
        };
    }
  }, [qualityLevel]);

  // Monitoring de performance avec throttling
  const monitorPerformance = useCallback((state, delta) => {
    const now = performance.now();
    if (now - lastPerformanceUpdate.current > 100) { // Mise à jour toutes les 100ms
      performanceManager.updatePerformance(delta);
      lastPerformanceUpdate.current = now;
    }
  }, []);

  return (
    <>
      {/* Performance monitoring intégré */}
      <PerformanceMonitor 
        onIncline={monitorPerformance} 
        onDecline={monitorPerformance}
        factor={0.5} // Seuil plus permissif
      />
      
      {/* Musique de fond */}
      {audioListener && <BackgroundMusic audioListener={audioListener} />}
      
      {/* Sky optimisé */}
      <Sky
        sunPosition={[5, 12, -8]}
        sunSize={qualityLevel === 0 ? 0.5 : 1}
        sunColor='#fff3a0'
        ambientIntensity={qualityLevel === 0 ? 0.5 : 0.65}
        preset='noon'
      />
      
      {/* Brouillard adaptatif */}
      <Fog color="#a0c1ea" {...fogParams} />

      {/* Rendu conditionnel des éléments selon la qualité */}
      <Suspense fallback={null}>
        <Paths 
          paths={worldPaths} 
          position={[0, 0, 0]}
          frequency={TERRAIN_CONFIG.frequency}
          amplitude={TERRAIN_CONFIG.amplitude}
        />
      </Suspense>

      <Suspense fallback={null}>
        <Grass {...grassParams} playerPositionRef={playerPositionRef} paths={worldPaths} />
      </Suspense>

      {/* Rendu conditionnel de la végétation */}
      {qualityLevel > 0 && (
        <>
          <Suspense fallback={null}>
            <Bushes {...bushParams} playerPositionRef={playerPositionRef} />
          </Suspense>

          <Suspense fallback={null}>
            <Flowers {...flowerParams} playerPositionRef={playerPositionRef} />
          </Suspense>
        </>
      )}

      {/* Physics avec paramètres adaptés */}
      <Physics 
        gravity={[0, -9.81, 0]} 
        debug={false}
        interpolate={qualityLevel > 0}
        colliders={false}
        paused={false}
        timeStep={qualityLevel === 0 ? 1/30 : 1/60} // Réduire la fréquence physique en basse qualité
      >
        <Ground 
          paths={worldPaths} 
          pathDetailTexture={TEXTURES.paths.sandstone.diffuse}
          baseTexture={TEXTURES.ground.rocky.diffuse}
        />
        
        {/* Player local */}
        {audioListener && (
          <Player 
            key={playerKey}
            audioListener={audioListener}
            stepSoundBuffers={stepSoundBuffers}
            playerPositionRef={playerPositionRef}
          />
        )}
        
        {/* Joueurs distants avec LOD */}
        {audioListener && players && Object.entries(players).map(([id, playerData]) => {
          if (id === localPlayerId) return null;
          
          // LOD pour les joueurs distants en basse qualité
          if (qualityLevel === 0 && playerPositionRef.current) {
            const distance = playerPositionRef.current.distanceTo(
              new THREE.Vector3(
                playerData.position?.x || 0,
                playerData.position?.y || 0,
                playerData.position?.z || 0
              )
            );
            
            // Ne pas rendre les joueurs distants très éloignés en basse qualité
            if (distance > 50) return null;
          }
          
          const remoteLocomotion = playerData?.locomotion || 'idle'; 
          return (
            <RemotePlayer 
              key={id} 
              playerData={playerData} 
              audioListener={audioListener}
              stepSoundBuffers={stepSoundBuffers} 
              locomotion={remoteLocomotion}
            />
          );
        })}
      </Physics>
    </>
  );
}

export default function CustomCanvas({ sunPosition, setSunPosition, children }) {
  return (
    <EmoteProvider>
      <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
        <Canvas
          camera={{ position: [0, 5, 10], fov: 50 }}
          shadows={{ 
            type: THREE.PCFSoftShadowMap,
            autoUpdate: true
          }}
          gl={{ 
            antialias: true,
            powerPreference: 'high-performance',
            precision: 'highp',
            physicallyCorrectLights: true,
            // Optimisations supplémentaires
            stencil: false,
            depth: true,
            alpha: false,
            preserveDrawingBuffer: false
          }}
          dpr={[1, 2]} // Limiter le device pixel ratio pour les performances
          performance={{ 
            min: 0.2, // Seuil minimum de performance
            max: 1.0, // Seuil maximum
            debounce: 200 // Délai avant ajustement
          }}
        >
          <SceneContent sunPosition={sunPosition} setSunPosition={setSunPosition} />
          {children} 
        </Canvas>
        
        {/* Menu d'émotes rendu en dehors du Canvas */}
        <EmoteMenuManager />
      </div>
    </EmoteProvider>
  );
}