import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react';
import Soundbar from './ui/Soundbar/Soundbar';
import { AudioProvider } from './context/AudioContext';
import { ControlsProvider } from './context/ControlsContext';
import MobileControls from './components/ui/MobileControls';
import LoadingScreen from './components/ui/LoadingScreen';
import ControlsHint from './ui/ControlsHint/ControlsHint';

const GameRuntime = lazy(() => import('./components/GameRuntime'));

function App() {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [vrmError, setVrmError] = useState(null);

  // Écouter le chargement du VRM local
  useEffect(() => {
    const onVrmSuccess = () => {
      console.log("App: VRM local chargé !");
      setVrmLoaded(true);
      setVrmError(null);
    };
    const onVrmError = (event) => {
      setVrmError(event.detail?.error || 'Erreur inconnue');
    };

    window.addEventListener('vrm-loading-success', onVrmSuccess);
    window.addEventListener('vrm-loading-error', onVrmError);
    return () => {
      window.removeEventListener('vrm-loading-success', onVrmSuccess);
      window.removeEventListener('vrm-loading-error', onVrmError);
    };
  }, []);

  const handleAssetsLoaded = useCallback(() => {
    setAssetsLoaded(true);
  }, []);

  return (
    <ControlsProvider>
      <AudioProvider>
        {/* L'écran de chargement attend que l'AssetLoader ET le VRM soient prêts */}
        <LoadingScreen
          isLoaded={assetsLoaded && vrmLoaded}
          error={vrmLoaded ? null : vrmError}
          onFinished={() => console.log("Jeu prêt et stabilisé !")}
        />

        <Soundbar />
        <ControlsHint active={assetsLoaded && vrmLoaded} />
        {/* Les contrôles mobiles seront rendus mais cachés/bloqués par le LoadingScreen */}
        <MobileControls />

        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100 }}>
          {/* Instructions pour l'utilisateur */}
          <div style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            display: 'none' // Caché pour la prod
          }}>
            Appuyez sur 'P' pour le moniteur de performance
          </div>
        </div>

        <Suspense fallback={null}>
          <GameRuntime
            assetsLoaded={assetsLoaded}
            onAssetsLoaded={handleAssetsLoaded}
          />
        </Suspense>
      </AudioProvider>
    </ControlsProvider>
  );
}

export default App;
