import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useContext } from 'react';
import { Physics, RigidBody, CapsuleCollider } from '@react-three/rapier';
import Ground from './World/Ground';
import Player from '../experience/Player';
import { MultiplayerContext } from '../experience/multiplayer/MultiplayerContext';
import RemotePlayer from '../experience/multiplayer/RemotePlayer';
import Grass from './World/GrassWithShadersUpdate';
import Sky from './World/Sky';

export default function CustomCanvas({ sunPosition, setSunPosition }) {
  const { players, localPlayerId } = useContext(MultiplayerContext);

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

        
          <Physics debug={true}>
            <Ground />
            <RigidBody colliders="trimesh">
              <Player />
              <CapsuleCollider args={[0.8, 0.4]} lockRotation={true}/>
            </RigidBody>
            {players && Object.entries(players).map(([id, playerData]) => {
              if (id === localPlayerId) return null;
              return <RemotePlayer key={id} playerData={playerData} />;
            })}
          </Physics>
       
      </Canvas>
    </div>
  );
}