import React, { useState } from 'react';
import * as THREE from 'three';
import CustomCanvas from './components/CustomCanvas';
import MultiplayerProvider from './experience/multiplayer/MultiplayerProvider';
import AssetLoader from './components/AssetLoader';
import { Physics } from '@react-three/rapier';
import Soundbar from './ui/Soundbar/Soundbar';
import { AudioProvider } from './context/AudioContext';

function App() {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [sunPosition, setSunPosition] = useState(new THREE.Vector3(0, 10, -10));

  return (
    <AudioProvider>
      <Soundbar />
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100 }}>

      </div>

      <AssetLoader onLoadComplete={() => setAssetsLoaded(true)}>
        <MultiplayerProvider initialConnectionDelay={assetsLoaded ? 0 : null}>
          <CustomCanvas
            sunPosition={sunPosition}
            setSunPosition={setSunPosition}
          />
        </MultiplayerProvider>
      </AssetLoader>
    </AudioProvider>
  );
}

export default App;