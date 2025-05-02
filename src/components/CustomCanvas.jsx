import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useContext, useMemo, useState, useEffect, useRef } from 'react';
import { Physics } from '@react-three/rapier';
import Ground from './World/Ground';
import Player from '../experience/Player';
import { MultiplayerContext } from '../experience/multiplayer/MultiplayerContext';
import RemotePlayer from '../experience/multiplayer/RemotePlayer';
import Grass from './World/GrassWithShadersUpdate';
import Sky from './World/Sky';
import { SOUNDS } from '../utils/const';

// Remettre les chemins des sons ici
const stepSoundPaths = [
  `${SOUNDS.grassStep}/Step1.mp3`,
  `${SOUNDS.grassStep}/Step2.mp3`,
  `${SOUNDS.grassStep}/Step3.mp3`,
  `${SOUNDS.grassStep}/Step4.mp3`,
  `${SOUNDS.grassStep}/Step5.mp3`,
];

// Composant interne pour gérer l'audio et le rendu
function SceneContent({ sunPosition, setSunPosition }) {
  const { camera } = useThree(); // Utiliser useThree ici car on est dans le Canvas
  const { players, localPlayerId } = useContext(MultiplayerContext);

  // Logique audio déplacée ici
  const [audioListener, setAudioListener] = useState(null);
  const stepSoundBuffers = useRef([]); // Utiliser useRef ici est suffisant

  // Initialiser l'AudioListener
  useEffect(() => {
    const listener = new THREE.AudioListener();
    camera.add(listener); 
    setAudioListener(listener);
    console.log("AudioListener ajouté à la caméra (depuis CustomCanvas)");

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
      console.log("AudioListener retiré de la caméra (depuis CustomCanvas)");
    };
  }, [camera]);

  const playerKey = useMemo(() => "local-player-" + Math.random().toString(36).substring(2, 9), []);

  return (
    <>
      {/* Sky and procedural clouds */}
      <Sky
        sunPosition={[5, 12, -8]}
        sunSize={1}
        sunColor='#fff3a0'
        ambientIntensity={0.65}
        preset='noon'
      />

      <Suspense fallback={null}>
        <Grass
          density={100000} 
          width={5} 
          height={5} 
          position={[0, 0 , 0]} 
        />
      </Suspense>

      {/* Physics avec gravité configurée */}
      <Physics 
        gravity={[0, -9.81, 0]} 
        debug={false}
        interpolate={true}
        colliders={false}
      >
        <Ground />
        
        {/* Player local - passer les props audio */}
        {audioListener && stepSoundBuffers.current.length > 0 && (
          <Player 
            key={playerKey} // Assurer une clé unique
            audioListener={audioListener}
            stepSoundBuffers={stepSoundBuffers} // Passer la ref directement
          />
        )}
        
        {/* Joueurs distants - passer les props audio et locomotion */}
        {audioListener && stepSoundBuffers.current.length > 0 && players && Object.entries(players).map(([id, playerData]) => {
            if (id === localPlayerId) return null;
            // Vérifier si playerData et locomotion existent
            const remoteLocomotion = playerData?.locomotion || 'idle'; 
            return (
              <RemotePlayer 
                key={id} 
                playerData={playerData} 
                audioListener={audioListener}
                stepSoundBuffers={stepSoundBuffers} // Passer la ref
                locomotion={remoteLocomotion} // Passer la locomotion distante
              />
            );
          })}
        
      </Physics>
    </>
  );
}

export default function CustomCanvas({ sunPosition, setSunPosition }) {
  // Ne pas utiliser useContext ici, le faire dans SceneContent
  // const { players, localPlayerId } = useContext(MultiplayerContext); 
  
  // Ne pas utiliser useMemo ici
  // const playerKey = useMemo(...);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 5, 10], fov: 50 }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        gl={{ antialias: true }}
      >
        {/* Rendre le composant interne qui a accès au contexte du Canvas */}
        <SceneContent sunPosition={sunPosition} setSunPosition={setSunPosition} />
      </Canvas>
    </div>
  );
}