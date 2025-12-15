import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { calculateHeight } from './Ground';

// Helper: gradient map for toon bands (Ghibli-like shading)
function createToonGradientTexture(steps = 4) {
  const width = steps;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const v = Math.round((i / (width - 1)) * 255);
    const o = i * 4;
    data[o + 0] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export default function Flowers({
  count = 100,
  width = 50,
  height = 50,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
  playerPositionRef
}) {
  const instancedMeshRefs = useRef([]);
  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const timeUniform = useMemo(() => ({ value: 0 }), []);

  // Shared gradient map for toon shading
  const gradientMap = useMemo(() => createToonGradientTexture(4), []);

  // Géométries de fleurs simples (style Genshin Impact)
  const flowerGeometries = useMemo(() => {
    const geometries = [];
    
    // Fleur simple : quelques pétales autour d'un centre
    const createFlowerGeometry = (petalCount, petalSize) => {
      const geo = new THREE.BufferGeometry();
      const positions = [];
      const colors = [];
      const indices = [];
      let vertexIndex = 0;

      // Centre de la fleur
      positions.push(0, 0.02, 0);
      colors.push(1, 1, 0.3); // Jaune pour le centre
      const centerIndex = vertexIndex++;

      // Pétales
      for (let i = 0; i < petalCount; i++) {
        const angle = (i / petalCount) * Math.PI * 2;
        const x = Math.cos(angle) * petalSize;
        const z = Math.sin(angle) * petalSize;
        
        // Sommet du pétale
        positions.push(x, 0.05, z);
        colors.push(1, 0.2, 0.8); // Rose/violet pour les pétales
        
        // Base du pétale (plus proche du centre)
        const baseX = Math.cos(angle) * petalSize * 0.3;
        const baseZ = Math.sin(angle) * petalSize * 0.3;
        positions.push(baseX, 0.01, baseZ);
        colors.push(1, 0.4, 0.9);
        
        // Triangles du pétale
        const petalTip = vertexIndex++;
        const petalBase = vertexIndex++;
        
        indices.push(centerIndex, petalBase, petalTip);
        
        // Connecter avec le pétale suivant
        if (i < petalCount - 1) {
          indices.push(centerIndex, petalBase + 2, petalBase);
        } else {
          indices.push(centerIndex, 1, petalBase); // Connecter le dernier au premier
        }
      }

      geo.setIndex(indices);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      
      return geo;
    };

    // Différents types de fleurs
    geometries.push(createFlowerGeometry(5, 0.04)); // Fleur à 5 pétales
    geometries.push(createFlowerGeometry(6, 0.03)); // Petite fleur à 6 pétales
    geometries.push(createFlowerGeometry(4, 0.05)); // Fleur à 4 pétales plus large
    
    return geometries;
  }, []);

  // Matériaux toon aux couleurs vives (avec bandes)
  const flowerMaterials = useMemo(() => {
    const materials = [];
    
    const materialConfigs = [
      { color: '#ff6b9d' }, // Rose
      { color: '#4ecdc4' }, // Turquoise
      { color: '#ffe66d' }, // Jaune
      { color: '#a8e6cf' }, // Vert menthe
      { color: '#ff8b9a' }  // Rose pâle
    ];
    
    materialConfigs.forEach(config => {
      const material = new THREE.MeshToonMaterial({
        color: new THREE.Color(config.color),
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        dithering: true,
        gradientMap,
      });

      // Animation légère au vent
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(/^/, 'uniform float time;\n');
        shader.uniforms.time = timeUniform;
        
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
          attribute vec3 instanceRandom;`
        );
        
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec3 worldPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float windTime = time * 1.2 + instanceRandom.x * 6.28;
          float windNoise = sin(windTime + worldPos.x * 0.2 + worldPos.z * 0.2) * 0.008;
          float heightFactor = max(0.0, position.y);
          transformed.x += windNoise * heightFactor;
          transformed.z += windNoise * 0.6 * heightFactor;`
        );
      };

      materials.push(material);
    });
    
    return materials;
  }, [timeUniform, gradientMap]);

  // Initialisation des instances
  useEffect(() => {
    instancedMeshRefs.current = [];
    
    // Répartir les fleurs entre les différents types
    const countsPerType = [
      Math.floor(count * 0.4), // 40% fleurs à 5 pétales
      Math.floor(count * 0.35), // 35% petites fleurs à 6 pétales
      Math.floor(count * 0.25)  // 25% fleurs à 4 pétales
    ];
    
    flowerGeometries.forEach((geometry, typeIndex) => {
      const typeCount = countsPerType[typeIndex];
      if (typeCount === 0) return;
      
      const instancedMesh = new THREE.InstancedMesh(
        geometry,
        flowerMaterials[typeIndex % flowerMaterials.length],
        typeCount
      );
      
      const instanceRandoms = new Float32Array(typeCount * 3);
      
      for (let i = 0; i < typeCount; i++) {
        // Position aléatoire mais éviter de se chevaucher avec les buissons
        let x, z, attempts = 0;
        do {
          x = (Math.random() - 0.5) * width;
          z = (Math.random() - 0.5) * height;
          attempts++;
        } while (attempts < 5); // Éviter les boucles infinies
        
        const groundHeight = calculateHeight(x, z, frequency, amplitude);
        
        dummyObj.position.set(x, groundHeight + 0.01, z);
        dummyObj.rotation.y = Math.random() * Math.PI * 2;
        
        // Échelle légèrement variable
        const scaleVariation = 0.8 + Math.random() * 0.4;
        dummyObj.scale.set(scaleVariation, scaleVariation, scaleVariation);
        
        dummyObj.updateMatrix();
        instancedMesh.setMatrixAt(i, dummyObj.matrix);
        
        instanceRandoms[i * 3] = Math.random();
        instanceRandoms[i * 3 + 1] = Math.random();
        instanceRandoms[i * 3 + 2] = Math.random();
      }
      
      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.geometry.setAttribute('instanceRandom', new THREE.InstancedBufferAttribute(instanceRandoms, 3));
      instancedMesh.castShadow = false; // Les fleurs ne projettent pas d'ombre
      instancedMesh.receiveShadow = true;
      
      instancedMeshRefs.current.push(instancedMesh);
    });
  }, [count, width, height, frequency, amplitude, position, dummyObj, flowerGeometries, flowerMaterials]);

  // Animation
  useFrame(({ clock }) => {
    timeUniform.value = clock.getElapsedTime();
  });

  return (
    <group position={position}>
      {instancedMeshRefs.current.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
} 