import React, { Suspense, useContext } from 'react';
import { Environment } from '@react-three/drei';
import CustomCanvas from './components/CustomCanvas';
import Ground from './components/World/Ground';
import Lighting from './components/World/Lighting';
import Player from './experience/Player';
import MultiplayerProvider from './experience/multiplayer/MultiplayerProvider';
import { MultiplayerContext } from './experience/multiplayer/MultiplayerContext';
import RemotePlayer from './experience/multiplayer/RemotePlayer';

function GameContent() {
  const { players, localPlayerId } = useContext(MultiplayerContext);

  return (
    <>
      <Lighting />
      <Ground />
      <Suspense fallback={null}>
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
  return (
    <MultiplayerProvider>
      <CustomCanvas>
        <GameContent />
      </CustomCanvas>
    </MultiplayerProvider>
  );
}

export default App;