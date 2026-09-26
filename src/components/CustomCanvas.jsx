import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Physics } from '@react-three/rapier';

import Ground from './World/Ground';
import Player from '../experience/Player';
import {
  MultiplayerActionsContext,
  MultiplayerStateContext,
} from '../experience/multiplayer/MultiplayerContext';
import RemotePlayer from '../experience/multiplayer/RemotePlayer';
import { createPaths } from './World/Paths';
import SkyDome from './World/Sky';
import SkyEnvironment from './World/SkyEnvironment';
import Lighting from './World/Lighting';
import Fog from './World/Fog';
import WorldBounds from './World/WorldBounds';
import { SOUNDS } from '../utils/const';
import BackgroundMusic from './audio/BackgroundMusic';
import { EmoteProvider, useEmoteContext } from '../context/EmoteContext';
import EmoteMenu from '../ui/EmoteMenu/EmoteMenu';
import Grass from './World/Grass';
import FluffyTrees from './World/FluffyTrees';
import ForestEdge from './World/ForestEdge';
import DistantForest from './World/DistantForest';
import FantasyHouse from './World/FantasyHouse';
import Decor from './World/Decor';
import AmbientEffects from './World/AmbientEffects';
import MeadowFlowers from './World/MeadowFlowers';
import Butterflies from './World/Butterflies';
import PostEffects from './effects/PostEffects';
import { WORLD_EXCLUSION_ZONES } from './World/worldConfig';
import { installAtmosphere } from './World/atmosphere';
import { SKY_COLORS, sharedUniforms } from './World/environment';
import {
  QUALITY_LEVELS,
  QUALITY_PRESETS,
  detectInitialQuality,
  levelFromQuality,
  qualityFromLevel,
} from '../utils/quality';

installAtmosphere();

const stepSoundPaths = [1, 2, 3, 4, 5].map((index) => `${SOUNDS.grassStep}/Step${index}.mp3`);

const GRASS_AREA = 112;
const INITIAL_QUALITY = detectInitialQuality();
const INITIAL_PRESET = QUALITY_PRESETS[INITIAL_QUALITY];

function EmoteMenuManager() {
  const { currentEmote, isEmoteMenuOpen, closeEmoteMenu, triggerEmote } = useEmoteContext();
  const { emitPlayerEmote } = useContext(MultiplayerActionsContext);

  const handleEmoteSelect = useCallback((emote) => {
    const animationName = triggerEmote(emote);
    emitPlayerEmote({
      emote: emote.id,
      type: emote.type,
      animation: animationName,
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

function WorldClock() {
  useFrame((state) => {
    sharedUniforms.uTime.value = state.clock.elapsedTime;
  });
  return null;
}

// Positions des joueurs transmises aux shaders d'herbe et de fleurs (qui s'écartent à leur passage)
function PlayerInteractions({ playerRef, players, localPlayerId }) {
  const remoteRef = useRef({ players, localPlayerId });

  useEffect(() => {
    remoteRef.current = { players, localPlayerId };
  }, [players, localPlayerId]);

  useFrame(() => {
    const positions = sharedUniforms.uPlayers.value;
    const { players: remote, localPlayerId: localId } = remoteRef.current;
    let count = 0;
    if (playerRef.current) positions[count++].copy(playerRef.current);
    if (remote) {
      for (const id in remote) {
        if (count >= positions.length) break;
        const position = remote[id]?.position;
        if (id !== localId && position) positions[count++].set(position.x, position.y, position.z);
      }
    }
    sharedUniforms.uPlayerCount.value = count;
  });

  return null;
}

// Ajuste la qualité : dégradation automatique si les FPS chutent, commandes manuelles
// depuis le panneau de performance (touche P).
function AdaptiveQuality({ quality, onChange }) {
  const autoRef = useRef(true);
  const maxLevel = levelFromQuality(INITIAL_QUALITY);

  useEffect(() => {
    const handleSetQuality = (event) => {
      onChange(qualityFromLevel(event.detail));
    };
    const handleAutoAdaptation = (event) => {
      autoRef.current = Boolean(event.detail);
    };
    window.addEventListener('setQualityLevel', handleSetQuality);
    window.addEventListener('setAutoAdaptation', handleAutoAdaptation);
    return () => {
      window.removeEventListener('setQualityLevel', handleSetQuality);
      window.removeEventListener('setAutoAdaptation', handleAutoAdaptation);
    };
  }, [onChange]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('qualityLevelChanged', { detail: levelFromQuality(quality) }));
  }, [quality]);

  const step = useCallback((direction) => {
    if (!autoRef.current) return;
    const current = levelFromQuality(quality);
    const next = Math.max(0, Math.min(maxLevel, current + direction));
    if (next !== current) onChange(QUALITY_LEVELS[next]);
  }, [quality, maxLevel, onChange]);

  return (
    <PerformanceMonitor
      flipflops={4}
      onDecline={() => step(-1)}
      onIncline={() => step(1)}
    />
  );
}

function SceneContent({ quality, onQualityChange }) {
  const camera = useThree((state) => state.camera);
  const { players, localPlayerId } = useContext(MultiplayerStateContext);
  const preset = QUALITY_PRESETS[quality];

  const playerPositionRef = useRef(new THREE.Vector3(0, 0, 0));
  const worldPaths = useMemo(() => createPaths(), []);

  const [audioListener, setAudioListener] = useState(null);
  const stepSoundBuffers = useRef([]);

  useEffect(() => {
    const listener = new THREE.AudioListener();
    camera.add(listener);
    setAudioListener(listener);

    let cancelled = false;
    const loader = new THREE.AudioLoader();
    Promise.all(
      stepSoundPaths.map((path) => new Promise((resolve) => {
        loader.load(path, resolve, undefined, () => resolve(null));
      })),
    ).then((buffers) => {
      if (!cancelled) stepSoundBuffers.current = buffers.filter(Boolean);
    });

    return () => {
      cancelled = true;
      camera.remove(listener);
    };
  }, [camera]);

  return (
    <>
      <WorldClock />
      <PlayerInteractions
        playerRef={playerPositionRef}
        players={players}
        localPlayerId={localPlayerId}
      />
      <AdaptiveQuality quality={quality} onChange={onQualityChange} />

      {audioListener && <BackgroundMusic audioListener={audioListener} />}

      <SkyDome />
      <SkyEnvironment />
      <Fog />
      <Lighting shadowMapSize={preset.shadowMapSize} shadowExtent={preset.shadowExtent} />

      <AmbientEffects paths={worldPaths} />
      <DistantForest paths={worldPaths} />

      <Grass
        paths={worldPaths}
        width={GRASS_AREA}
        height={GRASS_AREA}
        maxDensity={Math.round(500000 * INITIAL_PRESET.grassDensity)}
        exclusionZones={WORLD_EXCLUSION_ZONES}
      />
      <MeadowFlowers paths={worldPaths} count={Math.round(9000 * INITIAL_PRESET.grassDensity)} />
      <Butterflies />

      <Physics gravity={[0, -9.81, 0]} interpolate colliders={false} timeStep={1 / 60}>
        <Suspense fallback={null}>
          <Ground paths={worldPaths} />
        </Suspense>
        <WorldBounds />

        <Suspense fallback={null}>
          <FluffyTrees paths={worldPaths} />
          <ForestEdge paths={worldPaths} />
        </Suspense>

        <Suspense fallback={null}>
          <FantasyHouse />
        </Suspense>

        <Suspense fallback={null}>
          <Decor />
        </Suspense>

        {audioListener && (
          <Player
            audioListener={audioListener}
            stepSoundBuffers={stepSoundBuffers}
            playerPositionRef={playerPositionRef}
            paths={worldPaths}
          />
        )}

        {audioListener && players && Object.entries(players).map(([id, playerData]) => {
          if (id === localPlayerId) return null;
          return (
            <RemotePlayer
              key={id}
              playerData={playerData}
              audioListener={audioListener}
              stepSoundBuffers={stepSoundBuffers}
              locomotion={playerData?.locomotion || 'idle'}
            />
          );
        })}
      </Physics>

      {preset.postprocessing && <PostEffects multisampling={preset.multisampling} />}
    </>
  );
}

const GL_OPTIONS = {
  antialias: !INITIAL_PRESET.postprocessing,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true,
  alpha: false,
};

const CAMERA_OPTIONS = { position: [0, 5, 10], fov: 50, near: 0.1, far: 2000 };
const SHADOW_OPTIONS = { type: THREE.PCFSoftShadowMap };

export default function CustomCanvas({ children }) {
  const [quality, setQuality] = useState(INITIAL_QUALITY);
  const dpr = useMemo(() => {
    const deviceRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.min(deviceRatio, QUALITY_PRESETS[quality].maxDpr);
  }, [quality]);

  const handleCreated = useCallback(({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
    gl.setClearColor(SKY_COLORS.horizon);
  }, []);

  return (
    <EmoteProvider>
      <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
        <Canvas
          camera={CAMERA_OPTIONS}
          shadows={SHADOW_OPTIONS}
          gl={GL_OPTIONS}
          dpr={dpr}
          onCreated={handleCreated}
        >
          <SceneContent quality={quality} onQualityChange={setQuality} />
          {children}
        </Canvas>

        <EmoteMenuManager />
      </div>
    </EmoteProvider>
  );
}
