import { useEffect } from 'react';
import { useProgress } from '@react-three/drei';
import AssetLoader from './AssetLoader';
import CustomCanvas from './CustomCanvas';
import PerformanceDebugger, {
  PerformanceMonitor,
  usePerformanceDebugger,
} from './PerformanceDebugger';
import MultiplayerProvider from '../experience/multiplayer/MultiplayerProvider';
import ConnectionStatus from './ui/ConnectionStatus';

// L'écran de chargement vit hors du bundle 3D : la progression lui est transmise par événement
function LoadingProgressReporter() {
  const progress = useProgress((state) => state.progress);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('loading-progress', { detail: { progress } }));
  }, [progress]);

  return null;
}

export default function GameRuntime({ assetsLoaded, onAssetsLoaded }) {
  const { visible: debuggerVisible } = usePerformanceDebugger();

  return (
    <>
      <LoadingProgressReporter />
      <PerformanceDebugger visible={debuggerVisible} />
      <AssetLoader onLoadComplete={onAssetsLoaded}>
        <MultiplayerProvider initialConnectionDelay={assetsLoaded ? 0 : null}>
          <ConnectionStatus />
          <CustomCanvas>
            {debuggerVisible && <PerformanceMonitor />}
          </CustomCanvas>
        </MultiplayerProvider>
      </AssetLoader>
    </>
  );
}
