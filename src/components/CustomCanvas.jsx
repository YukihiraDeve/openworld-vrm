import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Stats, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import LensFlare from './World/LensFlareEffect';

import { Physics } from '@react-three/rapier';
import Ground from './World/Ground';
import Player from '../experience/Player';
import { MultiplayerContext } from '../experience/multiplayer/MultiplayerContext';
import RemotePlayer from '../experience/multiplayer/RemotePlayer';

import Paths, { createPaths } from './World/Paths';
import Sky from './World/Sky';
import { SOUNDS, TEXTURES } from '../utils/const';
import BackgroundMusic from './audio/BackgroundMusic';
import { EmoteProvider, useEmoteContext } from '../context/EmoteContext';
import EmoteMenu from '../ui/EmoteMenu/EmoteMenu';
// import LampPosts from './World/LampPosts'; // Commented out to remove lamp posts
import Grass from './World/Grass';
import FluffyTrees from './World/FluffyTrees';
import StylizedTrees from './World/StylizedTrees';
// import DebugTree from './World/DebugTree';

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

const GRASS_POSITION = [0, 0, 0];

// Detect mobile device
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Système de gestion de performance intelligent
class PerformanceManager {
  constructor() {
    this.frameTimings = [];
    this.lastUpdate = 0;
    this.currentQualityLevel = isMobile ? 0 : 1; // Start lower on mobile
    this.qualityChangeCallbacks = [];
    this.adaptationSpeed = 0.1;
    this.targetFPS = 60;
    this.minAcceptableFPS = 25;
    this.autoAdaptationEnabled = true;
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
        sunSize={qualityLevel === 0 ? 1.8 : 2.6}
        sunColor='#ffffff'
        ambientIntensity={qualityLevel === 0 ? 0.5 : 0.5}
        lightIntensity={1.0}
        preset='noon'
      />

      {/* Rendu conditionnel des éléments selon la qualité */}
      <Suspense fallback={null}>
        <Paths
          paths={worldPaths}
          position={[0, 0, 0]}
          frequency={TERRAIN_CONFIG.frequency}
          amplitude={TERRAIN_CONFIG.amplitude}
        />

          {/* Grass from Simple_Grass */}
        <Grass
          paths={worldPaths}
          frequency={TERRAIN_CONFIG.frequency}
          amplitude={TERRAIN_CONFIG.amplitude}
          width={TERRAIN_CONFIG.size}
          height={TERRAIN_CONFIG.size}
          qualityLevel={qualityLevel} // Pass quality level
          maxDensity={500000} 
          position={GRASS_POSITION}
          playerRef={playerPositionRef}
          players={players}
          localPlayerId={localPlayerId}
        />

        {/* Nouveaux Arbres Fluffy */}
        <FluffyTrees
          count={30}
          width={TERRAIN_CONFIG.size}
          height={TERRAIN_CONFIG.size}
          frequency={TERRAIN_CONFIG.frequency}
          amplitude={TERRAIN_CONFIG.amplitude}
          paths={worldPaths}
          scale={1.5} // Echelle ajustée pour correspondre au monde
        />
        {/* Arbres stylisés (tree.glb avec shaders contrastés) */}
        <StylizedTrees
          count={25}
          width={TERRAIN_CONFIG.size}
          height={TERRAIN_CONFIG.size}
          frequency={TERRAIN_CONFIG.frequency}
          amplitude={TERRAIN_CONFIG.amplitude}
          paths={worldPaths}
          scale={1.2}
        />
        {/* <DebugTree /> */}

        {/* LampPosts commented out to remove lamp posts */}
        {/* <LampPosts
          paths={worldPaths}
          frequency={TERRAIN_CONFIG.frequency}
          amplitude={TERRAIN_CONFIG.amplitude}
          spacing={12}
          sideOffset={1.2}
          postHeight={3.2}
          postRadius={0.08}
          lightColor={'#ffd8a8'}
          lightIntensity={5.5}
          lightDistance={14}
          enableGlowSprite={true}
        /> */}
      </Suspense>

      {/* Vegetation removed as per user request */}

      {/* Physics avec paramètres adaptés */}
      <Physics
        gravity={[0, -9.81, 0]}
        debug={false}
        interpolate={qualityLevel > 0}
        colliders={false}
        paused={false}
        timeStep={qualityLevel === 0 ? 1 / 30 : 1 / 60} // Réduire la fréquence physique en basse qualité
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
            paths={worldPaths}
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

      {/* Post-processing: lens flare + bloom */}
      {qualityLevel > 0 && (
        <EffectComposer>
          <LensFlare sunPosition={[5, 12, -8]} intensity={0.6} />
          <Bloom
            luminanceThreshold={1.0}
            luminanceSmoothing={0.3}
            intensity={1.5}
            mipmapBlur
            levels={5}
          />
        </EffectComposer>
      )}
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
          dpr={isMobile ? [1, 1.5] : [1, 2]} // Lower DPR limit for mobile
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