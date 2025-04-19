import React, { Suspense, useContext, useState } from 'react';
import * as THREE from 'three';
import CustomCanvas from './components/CustomCanvas';
import Ground from './components/World/Ground';
import Lighting from './components/World/Lighting';
import Player from './experience/Player';
import MultiplayerProvider from './experience/multiplayer/MultiplayerProvider';
import { MultiplayerContext } from './experience/multiplayer/MultiplayerContext';
import RemotePlayer from './experience/multiplayer/RemotePlayer';
import AssetLoader from './components/AssetLoader';

function GameContent({ sunPosition }) {
  const { players, localPlayerId } = useContext(MultiplayerContext);

  return (
    <>
      <Lighting sunPosition={sunPosition} />
      <Suspense fallback={null}>
        <Ground />
        <Player />
        {players && Object.entries(players).map(([id, playerData]) => {
          if (id === localPlayerId) return null;
          return <RemotePlayer key={id} playerData={playerData} />;
        })}
      </Suspense>
    </>
  );
}

function App() {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [sunPosition, setSunPosition] = useState(new THREE.Vector3(0, 10, -10));

  return (
    <>
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100 }}>

      </div>

      <AssetLoader onLoadComplete={() => setAssetsLoaded(true)}>
        <MultiplayerProvider initialConnectionDelay={assetsLoaded ? 0 : null}>
          <CustomCanvas
            sunPosition={sunPosition}
            setSunPosition={setSunPosition}
          >
            <GameContent sunPosition={sunPosition} />
          </CustomCanvas>
        </MultiplayerProvider>
      </AssetLoader>
    </>
  );
}

export default App;