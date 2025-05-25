import React, { useState } from 'react';
import * as THREE from 'three';
import CustomCanvas from './components/CustomCanvas';
import MultiplayerProvider from './experience/multiplayer/MultiplayerProvider';
import AssetLoader from './components/AssetLoader';
import { Physics } from '@react-three/rapier';
import Soundbar from './ui/Soundbar/Soundbar';
import { AudioProvider } from './context/AudioContext';
import { Stats } from "@react-three/drei";
import PerformanceDebugger, { usePerformanceDebugger, PerformanceMonitor } from './components/PerformanceDebugger';

function App() {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [sunPosition, setSunPosition] = useState(new THREE.Vector3(0, 10, -10));
  
  // Hook pour le debugger de performance
  const { visible: debuggerVisible, setVisible: setDebuggerVisible } = usePerformanceDebugger();

  return (
    <AudioProvider>
      <Soundbar />
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100 }}>
        {/* Instructions pour l'utilisateur */}
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          Appuyez sur 'P' pour le moniteur de performance
        </div>
      </div>

      {/* Sortir PerformanceDebugger du Canvas */}
      <PerformanceDebugger visible={debuggerVisible} />

      <AssetLoader onLoadComplete={() => setAssetsLoaded(true)}>
        <MultiplayerProvider initialConnectionDelay={assetsLoaded ? 0 : null}>
          <CustomCanvas
            sunPosition={sunPosition}
            setSunPosition={setSunPosition}
          >
            <Stats showPanel={0} />
            <PerformanceMonitor />
          </CustomCanvas>
        </MultiplayerProvider>
      </AssetLoader>
    </AudioProvider>
  );
}

export default App;