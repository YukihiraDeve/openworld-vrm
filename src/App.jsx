import React, { Suspense, useContext, useState } from 'react';
import { Environment } from '@react-three/drei';
import CustomCanvas from './components/CustomCanvas';
import Ground from './components/World/Ground';
import Lighting from './components/World/Lighting';
import Player from './experience/Player';
import MultiplayerProvider from './experience/multiplayer/MultiplayerProvider';
import { MultiplayerContext } from './experience/multiplayer/MultiplayerContext';
import RemotePlayer from './experience/multiplayer/RemotePlayer';
import AssetLoader from './components/AssetLoader';

function GameContent() {
  const { players, localPlayerId } = useContext(MultiplayerContext);

  return (
    <>
      <Lighting />
      <Suspense fallback={null}>
        <Ground />
        <Player />
        {players && Object.entries(players).map(([id, playerData]) => {
          if (id === localPlayerId) return null;
          return <RemotePlayer key={id} playerData={playerData} />;
        })}
        <Environment preset="sunset" />
      </Suspense>
    </>
  );
}

function App() {
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  return (
    <AssetLoader onLoadComplete={() => setAssetsLoaded(true)}>
      <MultiplayerProvider initialConnectionDelay={assetsLoaded ? 0 : null}>
        <CustomCanvas>
          <GameContent />
        </CustomCanvas>
      </MultiplayerProvider>
    </AssetLoader>
  );
}

export default App;