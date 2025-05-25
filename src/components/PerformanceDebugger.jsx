import React, { useState, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import memoryManager from '../utils/MemoryManager';

// Composant pour collecter les données INSIDE le Canvas
export const PerformanceMonitor = () => {
  const { gl } = useThree();
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const fpsHistory = useRef([]);
  const updateInterval = useRef(0);

  useFrame((state, delta) => {
    frameCount.current++;
    const now = performance.now();
    
    // Mise à jour toutes les 500ms pour éviter la surcharge
    if (now - updateInterval.current > 500) {
      const timeDiff = now - lastTime.current;
      const fps = Math.round((frameCount.current * 1000) / timeDiff);
      
      // Historique FPS pour la moyenne
      fpsHistory.current.push(fps);
      if (fpsHistory.current.length > 10) {
        fpsHistory.current.shift();
      }
      
      const avgFps = fpsHistory.current.reduce((a, b) => a + b, 0) / fpsHistory.current.length;
      
      const stats = {
        fps: Math.round(avgFps),
        frameTime: Math.round(delta * 1000 * 10) / 10,
        memory: memoryManager.getStats(),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        points: gl.info.render.points,
        lines: gl.info.render.lines
      };
      
      // Envoyer les stats via un événement personnalisé
      window.dispatchEvent(new CustomEvent('performanceStats', { detail: stats }));
      
      frameCount.current = 0;
      lastTime.current = now;
      updateInterval.current = now;
    }
  });

  return null; // Ce composant ne rend rien visuellement
};

// Composant UI OUTSIDE le Canvas
const PerformanceDebugger = ({ visible = false }) => {
  const [stats, setStats] = useState({
    fps: 0,
    frameTime: 0,
    memory: { textures: 0, geometries: 0, materials: 0, totalMemory: 0 },
    drawCalls: 0,
    triangles: 0,
    points: 0,
    lines: 0
  });

  const [qualityLevel, setQualityLevel] = useState(1);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [memoryOptimization, setMemoryOptimization] = useState(false);

  // Écouter les événements de performance
  useEffect(() => {
    const handlePerformanceStats = (event) => {
      setStats(event.detail);
    };

    window.addEventListener('performanceStats', handlePerformanceStats);
    return () => window.removeEventListener('performanceStats', handlePerformanceStats);
  }, []);

  useEffect(() => {
    if (memoryOptimization) {
      memoryManager.enableLowMemoryMode();
    } else {
      memoryManager.disableLowMemoryMode();
    }
  }, [memoryOptimization]);

  // Nouveau: Gérer l'adaptation automatique
  useEffect(() => {
    // Envoyer la commande au PerformanceManager via un événement
    window.dispatchEvent(new CustomEvent('setAutoAdaptation', { detail: autoOptimize }));
  }, [autoOptimize]);

  const handleQualityChange = (level) => {
    setQualityLevel(level);
    // Envoyer la commande au PerformanceManager
    window.dispatchEvent(new CustomEvent('setQualityLevel', { detail: level }));
    console.log(`Quality level manually set to: ${level}`);
  };

  const handleMemoryCleanup = () => {
    memoryManager.cleanup();
    console.log('Manual memory cleanup triggered');
  };

  const getPerformanceColor = (fps) => {
    if (fps >= 50) return '#4CAF50'; // Vert
    if (fps >= 30) return '#FF9800'; // Orange
    return '#F44336'; // Rouge
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 1000,
      minWidth: '300px',
      maxHeight: '80vh',
      overflowY: 'auto'
    }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#FFD700' }}>Performance Monitor</h3>
      
      {/* Statistiques de performance */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#87CEEB' }}>Performance</h4>
        <div style={{ color: getPerformanceColor(stats.fps) }}>
          <strong>FPS: {stats.fps}</strong>
        </div>
        <div>Frame Time: {stats.frameTime}ms</div>
        <div>Draw Calls: {stats.drawCalls}</div>
        <div>Triangles: {stats.triangles.toLocaleString()}</div>
        {stats.points > 0 && <div>Points: {stats.points.toLocaleString()}</div>}
        {stats.lines > 0 && <div>Lines: {stats.lines.toLocaleString()}</div>}
      </div>

      {/* Statistiques mémoire */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#87CEEB' }}>Memory Usage</h4>
        <div>Textures: {stats.memory.textures}</div>
        <div>Geometries: {stats.memory.geometries}</div>
        <div>Materials: {stats.memory.materials}</div>
        <div>Est. Memory: {formatBytes(stats.memory.totalMemory)}</div>
        {stats.memory.isLowMemory && (
          <div style={{ color: '#FF6B6B', fontWeight: 'bold' }}>
            ⚠️ LOW MEMORY MODE
          </div>
        )}
        {performance.memory && (
          <>
            <div>JS Heap: {formatBytes(performance.memory.usedJSHeapSize)}</div>
            <div>JS Limit: {formatBytes(performance.memory.jsHeapSizeLimit)}</div>
            <div>Usage: {Math.round((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100)}%</div>
          </>
        )}
      </div>

      {/* Contrôles manuels */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#87CEEB' }}>Controls</h4>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Quality Level:</label>
          <div>
            {[0, 1, 2].map(level => (
              <button
                key={level}
                onClick={() => handleQualityChange(level)}
                style={{
                  backgroundColor: qualityLevel === level ? '#4CAF50' : '#666',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  margin: '0 2px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '10px'
                }}
              >
                {level === 0 ? 'Low' : level === 1 ? 'Med' : 'High'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoOptimize}
              onChange={(e) => setAutoOptimize(e.target.checked)}
              style={{ marginRight: '5px' }}
            />
            Auto Quality Adaptation
          </label>
          {!autoOptimize && (
            <div style={{ color: '#FFD700', fontSize: '10px', marginTop: '2px' }}>
              ⚠️ Manual quality control active
            </div>
          )}
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={memoryOptimization}
              onChange={(e) => setMemoryOptimization(e.target.checked)}
              style={{ marginRight: '5px' }}
            />
            Memory Optimization
          </label>
        </div>

        <button
          onClick={handleMemoryCleanup}
          style={{
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '11px',
            width: '100%'
          }}
        >
          Force Memory Cleanup
        </button>
      </div>

      {/* Recommandations */}
      <div>
        <h4 style={{ margin: '0 0 8px 0', color: '#87CEEB' }}>Recommendations</h4>
        <div style={{ fontSize: '10px', color: '#DDD' }}>
          {stats.fps < 30 && (
            <div style={{ color: '#FF6B6B' }}>• Consider lowering quality level</div>
          )}
          {stats.drawCalls > 1000 && (
            <div style={{ color: '#FF9800' }}>• High draw calls detected</div>
          )}
          {stats.triangles > 500000 && (
            <div style={{ color: '#FF9800' }}>• High polygon count</div>
          )}
          {stats.memory.textures > 50 && (
            <div style={{ color: '#FF9800' }}>• Many textures loaded</div>
          )}
          {stats.fps >= 50 && stats.drawCalls < 500 && (
            <div style={{ color: '#4CAF50' }}>• Performance looks good!</div>
          )}
          {!autoOptimize && (
            <div style={{ color: '#FFD700' }}>• Auto-adaptation disabled</div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div style={{ 
        marginTop: '15px', 
        paddingTop: '10px', 
        borderTop: '1px solid #555',
        fontSize: '10px',
        color: '#AAA'
      }}>
        <div>Press 'P' to toggle this panel</div>
        <div>Press 'R' to reset camera</div>
        <div>Scroll to zoom camera</div>
        <div>Uncheck "Auto Quality" to prevent auto-switching</div>
      </div>
    </div>
  );
};

// Hook pour contrôler la visibilité
export const usePerformanceDebugger = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.key.toLowerCase() === 'p') {
        setVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return { visible, setVisible };
};

export default PerformanceDebugger; 