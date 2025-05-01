import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useContext, useMemo } from 'react';
import { Physics } from '@react-three/rapier';
import Ground from './World/Ground';
import Player from '../experience/Player';
import { MultiplayerContext } from '../experience/multiplayer/MultiplayerContext';
import RemotePlayer from '../experience/multiplayer/RemotePlayer';
import Grass from './World/GrassWithShadersUpdate';
import Sky from './World/Sky';

export default function CustomCanvas({ sunPosition, setSunPosition }) {
  const { players, localPlayerId } = useContext(MultiplayerContext);
  
  // Créer un identifiant unique pour le joueur local
  const playerKey = useMemo(() => "local-player-" + Math.random().toString(36).substring(2, 9), []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Canvas
        camera={{ position: [0, 5, 10], fov: 50 }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        gl={{ antialias: true }}
      >
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
          
          {/* Player avec son propre RigidBody géré dans VrmAvatar */}
          <Player />
          
          {/* Joueurs distants */}
          {players && Object.entries(players).map(([id, playerData]) => {
            if (id === localPlayerId) return null;
            return <RemotePlayer key={id} playerData={playerData} />;
          })}
          
        </Physics>
       
      </Canvas>
    </div>
  );
}