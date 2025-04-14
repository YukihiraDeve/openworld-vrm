import React, { Suspense } from 'react';
import { Environment } from '@react-three/drei';
import CustomCanvas from './components/CustomCanvas';
import Ground from './components/World/Ground';
import Lighting from './components/World/Lighting';
import Player from './experience/Player';

function App() {
  return (
    <CustomCanvas>
      <Lighting />
      <Ground />
      <Suspense fallback={null}>
        <Player />
        <Environment preset="sunset" />
      </Suspense>
    </CustomCanvas>
  );
}

export default App;