import React, { useEffect, useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { calculateHeight } from './Ground';
import { isPositionOnPath } from './Paths';

// Végétation simple avec géométries basiques (fallback)
export default function SimpleVegetation({
  count = 50,
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
  
  // Géométries simples
  const bushGeometry = useMemo(() => new THREE.SphereGeometry(0.8, 8, 6), []);
  const rockGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.6, 1), []);
  const flowerGeometry = useMemo(() => new THREE.CylinderGeometry(0.1, 0.1, 0.5), []);
  
  // Matériaux simples
  const bushMaterial = useMemo(() => new THREE.MeshLambertMaterial({ 
    color: '#228833' 
  }), []);
  const rockMaterial = useMemo(() => new THREE.MeshLambertMaterial({ 
    color: '#666666' 
  }), []);
  const flowerMaterial = useMemo(() => new THREE.MeshLambertMaterial({ 
    color: '#ff6666' 
  }), []);

  // Placement procédural
  const [vegetationInstances, setVegetationInstances] = useState([]);

  useEffect(() => {
    const triesMax = count * 10;
    const minDistanceBase = 2.0;
    const minDistance = minDistanceBase * Math.max(1, sizeMultiplier * 0.3);
    const pathMarginLocal = 1.5;
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

      // Sélectionner un type
      const rand = Math.random();
      let type;
      if (rand < 0.5) type = 'bush';
      else if (rand < 0.8) type = 'rock';
      else type = 'flower';

      accepted.push({ x, y, z, type });
    }

    setVegetationInstances(accepted);
  }, [count, width, height, frequency, amplitude, paths, sizeMultiplier]);

  // LOD system
  const [visibleVegetation, setVisibleVegetation] = useState([]);
  const LOD_DISTANCE = 30;
  
  useEffect(() => {
    if (!playerPositionRef?.current || vegetationInstances.length === 0) {
      setVisibleVegetation(vegetationInstances);
      return;
    }
    
    const playerPos = playerPositionRef.current;
    const visible = vegetationInstances.filter(vegetation => {
      const distance = Math.sqrt(
        (vegetation.x - playerPos.x) ** 2 + (vegetation.z - playerPos.z) ** 2
      );
      return distance <= LOD_DISTANCE;
    });
    
    setVisibleVegetation(visible);
  }, [vegetationInstances, playerPositionRef?.current]);

  return (
    <group ref={groupRef} position={position}>
      {visibleVegetation.map((vegetation, index) => {
        let geometry, material;
        
        switch (vegetation.type) {
          case 'bush':
            geometry = bushGeometry;
            material = bushMaterial;
            break;
          case 'rock':
            geometry = rockGeometry;
            material = rockMaterial;
            break;
          case 'flower':
            geometry = flowerGeometry;
            material = flowerMaterial;
            break;
          default:
            geometry = bushGeometry;
            material = bushMaterial;
        }

        const scale = sizeMultiplier * (0.6 + (index * 0.127) % 0.4);
        const rotation = (index * 0.421) % (Math.PI * 2);

        return (
          <mesh
            key={`simple-vegetation-${vegetation.x}-${vegetation.z}-${vegetation.type}`}
            geometry={geometry}
            material={material}
            position={[vegetation.x, vegetation.y, vegetation.z]}
            rotation={[0, rotation, 0]}
            scale={[scale, scale, scale]}
            castShadow
            receiveShadow
          />
        );
      })}
    </group>
  );
}