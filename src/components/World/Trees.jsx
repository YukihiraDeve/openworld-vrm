import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { calculateHeight } from './Ground';
import { isPositionOnPath } from './Paths';

// Composant optimisé pour une instance d'arbre
const TreeInstance = memo(({ model, position, rotation, scale, visible }) => {
  const { scene } = useMemo(() => {
    if (!model) return { scene: null };
    const clone = model.clone();
    
    // Optimisation des matériaux une seule fois au clonage
    clone.traverse((child) => {
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.matrixAutoUpdate = false; // Important pour la performance statique
        child.updateMatrix();
        
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (mat.isMeshStandardMaterial || mat.isMeshPhongMaterial) {
            mat.roughness = 0.8;
            mat.metalness = 0.1;
            mat.envMapIntensity = 0.3;
          }
        });
        
        if (child.geometry) {
          child.geometry.computeBoundingSphere();
          child.frustumCulled = true;
        }
      }
    });
    
    return { scene: clone };
  }, [model]);

  if (!scene) return null;

  return (
    <primitive 
      object={scene}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={visible}
    />
  );
});

export default function Trees({
  count = 50,
  width = 100,
  height = 100,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
  paths = [],
  sizeMultiplier = 2,
  playerPositionRef,
}) {
  const groupRef = useRef(null);
  
  const birchModel = useLoader(FBXLoader, '/assets/models/Birch Trees/BirchTrees.fbx');
  const mapleModel = useLoader(FBXLoader, '/assets/models/Maple Trees/MapleTrees.fbx');
  const palmModel = useLoader(FBXLoader, '/assets/models/Palm Trees/PalmTrees.fbx');
  const pineModel = useLoader(FBXLoader, '/assets/models/Pine Trees/PineTrees.fbx');
  const deadModel = useLoader(FBXLoader, '/assets/models/Dead Trees/DeadTrees.fbx');
  
  const treeModels = useMemo(() => 
    [birchModel, mapleModel, palmModel, pineModel, deadModel],
    [birchModel, mapleModel, palmModel, pineModel, deadModel]
  );
  
  const allModelsLoaded = useMemo(() => 
    treeModels.every(model => model && model.children && model.children.length > 0),
    [treeModels]
  );

  const [treeInstances, setTreeInstances] = useState([]);
  
  // Génération des positions (inchangée)
  useEffect(() => {
    if (!allModelsLoaded) return;

    const triesMax = count * 12;
    const minDistanceBase = 3.0;
    const minDistance = minDistanceBase * Math.max(1, sizeMultiplier * 0.5);
    const pathMarginLocal = 2.0;
    const maxSlope = 0.25;
    const accepted = [];

    const isValidPosition = (x, z) => {
      if (paths && paths.length > 0 && isPositionOnPath(x, z, paths, pathMarginLocal)) return false;
      const h = calculateHeight(x, z, frequency, amplitude);
      const hx = calculateHeight(x + 0.5, z, frequency, amplitude);
      const hz = calculateHeight(x, z + 0.5, frequency, amplitude);
      const slope = Math.max(Math.abs(hx - h), Math.abs(hz - h));
      if (slope > maxSlope) return false;
      for (const p of accepted) {
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < minDistance * minDistance) return false;
      }
      return true;
    };

    let attempts = 0;
    while (accepted.length < count && attempts < triesMax) {
      attempts++;
      const x = (Math.random() - 0.5) * width;
      const z = (Math.random() - 0.5) * height;
      if (!isValidPosition(x, z)) continue;
      const y = calculateHeight(x, z, frequency, amplitude);
      
      const rand = Math.random();
      let modelIndex;
      if (rand < 0.25) modelIndex = 0;
      else if (rand < 0.50) modelIndex = 1;
      else if (rand < 0.70) modelIndex = 2;
      else if (rand < 0.90) modelIndex = 3;
      else modelIndex = 4;
      
      accepted.push({ x, y, z, modelIndex });
    }
    
    setTreeInstances(accepted);
  }, [count, width, height, frequency, amplitude, paths, sizeMultiplier, allModelsLoaded]);

  const treeRenderData = useMemo(() => {
    return treeInstances.map((tree, index) => ({
      ...tree,
      scale: [sizeMultiplier * (0.8 + (index * 0.1) % 0.4), sizeMultiplier * (0.8 + (index * 0.1) % 0.4), sizeMultiplier * (0.8 + (index * 0.1) % 0.4)],
      rotation: [0, (index * 0.3) % (Math.PI * 2), 0]
    }));
  }, [treeInstances, sizeMultiplier]);

  // État de visibilité (Set pour recherche rapide)
  const [visibleIndices, setVisibleIndices] = useState(new Set());
  const LOD_DISTANCE = 40;

  useEffect(() => {
    if (!playerPositionRef?.current) {
        // Si pas de ref joueur, tout afficher (ou rien)
        setVisibleIndices(new Set(treeRenderData.map((_, i) => i)));
        return;
    }
    
    const updateVisibility = () => {
      const playerPos = playerPositionRef.current;
      if (!playerPos) return;

      const newVisible = new Set();
      treeRenderData.forEach((tree, index) => {
        const distSq = (tree.x - playerPos.x) ** 2 + (tree.z - playerPos.z) ** 2;
        if (distSq <= LOD_DISTANCE * LOD_DISTANCE) {
          newVisible.add(index);
        }
      });
      
      setVisibleIndices(prev => {
        // Optimisation: ne pas mettre à jour l'état si rien n'a changé
        if (prev.size !== newVisible.size) return newVisible;
        for (let val of newVisible) if (!prev.has(val)) return newVisible;
        return prev;
      });
    };

    updateVisibility(); // Initial update
    
    const interval = setInterval(updateVisibility, 500);
    return () => clearInterval(interval);
  }, [treeRenderData, playerPositionRef, LOD_DISTANCE]);

  if (!allModelsLoaded) return <group ref={groupRef} position={position} />;

  return (
    <group ref={groupRef} position={position}>
      {treeRenderData.map((tree, index) => (
        <TreeInstance
          key={`tree-${index}`}
          model={treeModels[tree.modelIndex]}
          position={[tree.x, tree.y, tree.z]}
          rotation={tree.rotation}
          scale={tree.scale}
          visible={visibleIndices.has(index)}
        />
      ))}
    </group>
  );
}
