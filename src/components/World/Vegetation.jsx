import React, { useEffect, useState, useRef, useMemo, memo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { calculateHeight } from './Ground';
import { isPositionOnPath } from './Paths';

// Composant optimisé pour une instance de végétation
const VegetationInstance = memo(({ model, position, rotation, scale, visible }) => {
  const { scene } = useMemo(() => {
    if (!model) return { scene: null };
    const clone = model.clone();
    
    // Optimisation des matériaux une seule fois au clonage
    clone.traverse((child) => {
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.matrixAutoUpdate = false; // Très important pour les objets statiques
        child.updateMatrix();
        
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (mat.isMeshStandardMaterial || mat.isMeshPhongMaterial) {
            mat.roughness = 0.9;
            mat.metalness = 0.0;
            mat.envMapIntensity = 0.2;
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

export default function Vegetation({
  count = 35,
  width = 100,
  height = 100,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
  paths = [],
  sizeMultiplier = 1.5,
  playerPositionRef,
}) {
  const groupRef = useRef(null);

  const bushesModel = useLoader(FBXLoader, '/assets/models/Bushes/Bushes.fbx');
  const flowerBushesModel = useLoader(FBXLoader, '/assets/models/Flower Bushes/FlowerBushes.fbx');
  const flowersModel = useLoader(FBXLoader, '/assets/models/Flowers/Flowers.fbx');
  const grassModel = useLoader(FBXLoader, '/assets/models/Grass/Grass.fbx');
  const rocksModel = useLoader(FBXLoader, '/assets/models/Rocks/Rocks.fbx');
  const moreDeadTreesModel = useLoader(FBXLoader, '/assets/models/Dead Trees/MoreDeadTrees.fbx');

  const vegetationModels = useMemo(() => [
    bushesModel,
    flowerBushesModel, 
    flowersModel,
    grassModel,
    rocksModel,
    moreDeadTreesModel
  ], [bushesModel, flowerBushesModel, flowersModel, grassModel, rocksModel, moreDeadTreesModel]);
  
  const allModelsLoaded = useMemo(() => 
    vegetationModels.every(model => model && model.children && model.children.length > 0),
    [vegetationModels]
  );

  const [vegetationInstances, setVegetationInstances] = useState([]);

  useEffect(() => {
    if (!allModelsLoaded) return;

    const triesMax = count * 10;
    const minDistanceBase = 1.2;
    const minDistance = minDistanceBase * Math.max(1, sizeMultiplier * 0.3);
    const pathMarginLocal = 1.2;
    const maxSlope = 0.4;
    const accepted = [];

    const isValidPosition = (x, z) => {
      if (paths && paths.length > 0 && isPositionOnPath(x, z, paths, pathMarginLocal)) return false;
      const h = calculateHeight(x, z, frequency, amplitude);
      const hx = calculateHeight(x + 0.3, z, frequency, amplitude);
      const hz = calculateHeight(x, z + 0.3, frequency, amplitude);
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
      if (rand < 0.30) modelIndex = 0;
      else if (rand < 0.50) modelIndex = 1;
      else if (rand < 0.70) modelIndex = 2;
      else if (rand < 0.85) modelIndex = 3;
      else if (rand < 0.95) modelIndex = 4;
      else modelIndex = 5;

      accepted.push({ x, y, z, modelIndex });
    }

    setVegetationInstances(accepted);
  }, [count, width, height, frequency, amplitude, paths, sizeMultiplier, allModelsLoaded]);

  const vegetationRenderData = useMemo(() => {
    return vegetationInstances.map((vegetation, index) => {
      let scaleVariation;
      const seedScale = (index * 0.127) % 1;
      
      switch (vegetation.modelIndex) {
        case 0:
        case 1:
          scaleVariation = sizeMultiplier * (0.7 + seedScale * 0.6);
          break;
        case 2:
        case 3:
          scaleVariation = sizeMultiplier * (0.5 + seedScale * 0.8);
          break;
        case 4:
          scaleVariation = sizeMultiplier * (0.6 + seedScale * 0.8);
          break;
        case 5:
          scaleVariation = sizeMultiplier * (1.0 + seedScale * 0.5);
          break;
        default:
          scaleVariation = sizeMultiplier * (0.8 + seedScale * 0.4);
      }

      const rotation = (index * 0.421) % (Math.PI * 2);

      return {
        ...vegetation,
        scale: [scaleVariation, scaleVariation, scaleVariation],
        rotation: [0, rotation, 0]
      };
    });
  }, [vegetationInstances, sizeMultiplier]);

  const [visibleIndices, setVisibleIndices] = useState(new Set());
  const LOD_DISTANCE = 25;
  
  useEffect(() => {
    if (!playerPositionRef?.current) {
        setVisibleIndices(new Set(vegetationRenderData.map((_, i) => i)));
        return;
    }
    
    const updateVisibility = () => {
      const playerPos = playerPositionRef.current;
      if (!playerPos) return;
      
      const newVisible = new Set();
      vegetationRenderData.forEach((veg, index) => {
        const distSq = (veg.x - playerPos.x) ** 2 + (veg.z - playerPos.z) ** 2;
        if (distSq <= LOD_DISTANCE * LOD_DISTANCE) {
            newVisible.add(index);
        }
      });
      
      setVisibleIndices(prev => {
        if (prev.size !== newVisible.size) return newVisible;
        for (let val of newVisible) if (!prev.has(val)) return newVisible;
        return prev;
      });
    };

    updateVisibility();
    
    const interval = setInterval(updateVisibility, 1000);
    return () => clearInterval(interval);
  }, [vegetationRenderData, playerPositionRef, LOD_DISTANCE]);

  if (!allModelsLoaded) return <group ref={groupRef} position={position} />;

  return (
    <group ref={groupRef} position={position}>
      {vegetationRenderData.map((veg, index) => (
        <VegetationInstance
          key={`veg-${index}`}
          model={vegetationModels[veg.modelIndex]}
          position={[veg.x, veg.y, veg.z]}
          rotation={veg.rotation}
          scale={veg.scale}
          visible={visibleIndices.has(index)}
        />
      ))}
    </group>
  );
}
