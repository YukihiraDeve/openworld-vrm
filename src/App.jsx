import React, { useState } from 'react';
import * as THREE from 'three';
import CustomCanvas from './components/CustomCanvas';
import MultiplayerProvider from './experience/multiplayer/MultiplayerProvider';
import AssetLoader from './components/AssetLoader';
import { Physics } from '@react-three/rapier';
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
          />
        </MultiplayerProvider>
      </AssetLoader>
    </>
  );
}

export default App;