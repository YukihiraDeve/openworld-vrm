import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { calculateHeight } from './Ground';

export default function Bushes({
  count = 200,
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

  // Charger la texture alpha pour le feuillage
  const foliageAlpha = useTexture('https://douges.dev/static/foliage_alpha3.png');

  useEffect(() => {
    if (foliageAlpha) {
      foliageAlpha.wrapS = foliageAlpha.wrapT = THREE.RepeatWrapping;
      foliageAlpha.minFilter = THREE.LinearMipMapLinearFilter;
      foliageAlpha.magFilter = THREE.LinearFilter;
    }
  }, [foliageAlpha]);

  // Création de géométries de feuillage avec des plans croisés
  const bushGeometries = useMemo(() => {
    const geometries = [];
    
    // Type 1: Buisson avec plus de plans croisés
    const createCrossedPlanes = (size, planCount = 6) => {
      const geo = new THREE.BufferGeometry();
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      let vertexIndex = 0;

      for (let i = 0; i < planCount; i++) {
        const angle = (i / planCount) * Math.PI + Math.random() * 0.2; // Légère variation
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        // Créer un plan vertical orienté selon l'angle
        const halfSize = size * (0.45 + Math.random() * 0.1); // Légère variation de taille
        
        // Coins du plan avec légère courbe
        const corners = [
          [-halfSize * cos, -halfSize, -halfSize * sin], // bas gauche
          [halfSize * cos, -halfSize, halfSize * sin],   // bas droit
          [halfSize * cos, halfSize, halfSize * sin],    // haut droit
          [-halfSize * cos, halfSize, -halfSize * sin]   // haut gauche
        ];
        
        corners.forEach(corner => {
          positions.push(...corner);
          normals.push(0, 0, 1); // Normal simple
        });
        
        // UVs pour la texture
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        
        // Indices pour les triangles (deux triangles par plan)
        const baseIndex = vertexIndex;
        indices.push(
          baseIndex, baseIndex + 1, baseIndex + 2,
          baseIndex, baseIndex + 2, baseIndex + 3
        );
        vertexIndex += 4;
      }

      geo.setIndex(indices);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.computeVertexNormals();
      
      return geo;
    };

    // Type 2: Petite touffe de feuillage très dense
    const createSmallTuft = (size) => {
      const geo = new THREE.BufferGeometry();
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      let vertexIndex = 0;

      // 10 plans orientés aléatoirement pour un effet très dense
      for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const tilt = (Math.random() - 0.5) * 0.6; // Plus de variation d'inclinaison
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const halfSize = size * (0.25 + Math.random() * 0.35);
        
        const corners = [
          [-halfSize * cos, -halfSize + tilt, -halfSize * sin],
          [halfSize * cos, -halfSize + tilt, halfSize * sin],
          [halfSize * cos, halfSize + tilt, halfSize * sin],
          [-halfSize * cos, halfSize + tilt, -halfSize * sin]
        ];
        
        corners.forEach(corner => {
          positions.push(...corner);
          normals.push(0, 0, 1);
        });
        
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        
        const baseIndex = vertexIndex;
        indices.push(
          baseIndex, baseIndex + 1, baseIndex + 2,
          baseIndex, baseIndex + 2, baseIndex + 3
        );
        vertexIndex += 4;
      }

      geo.setIndex(indices);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.computeVertexNormals();
      
      return geo;
    };

    // Type 3: Buisson très dense avec beaucoup plus de plans
    const createDenseBush = (size) => {
      const geo = new THREE.BufferGeometry();
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      let vertexIndex = 0;

      // 12 plans pour un buisson ultra dense
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const height = 0.7 + Math.random() * 0.6;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const halfSize = size * (0.3 + Math.random() * 0.4);
        
        const corners = [
          [-halfSize * cos, -halfSize * height, -halfSize * sin],
          [halfSize * cos, -halfSize * height, halfSize * sin],
          [halfSize * cos, halfSize * height, halfSize * sin],
          [-halfSize * cos, halfSize * height, -halfSize * sin]
        ];
        
        corners.forEach(corner => {
          positions.push(...corner);
          normals.push(0, 0, 1);
        });
        
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        
        const baseIndex = vertexIndex;
        indices.push(
          baseIndex, baseIndex + 1, baseIndex + 2,
          baseIndex, baseIndex + 2, baseIndex + 3
        );
        vertexIndex += 4;
      }

      geo.setIndex(indices);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.computeVertexNormals();
      
      return geo;
    };

    geometries.push(createCrossedPlanes(1.2, 6));  // Buisson moyen - plus de plans
    geometries.push(createSmallTuft(0.8));         // Petite touffe très dense
    geometries.push(createDenseBush(1.0));         // Buisson ultra dense
    geometries.push(createCrossedPlanes(0.6, 8));  // Petit buisson très détaillé
    geometries.push(createCrossedPlanes(1.6, 5));  // Grand buisson plus fourni
    
    return geometries;
  }, []);

  // Matériaux avec la texture alpha et couleurs harmonisées avec l'herbe
  const bushMaterials = useMemo(() => {
    if (!foliageAlpha) return [];
    
    const materials = [];
    
    // Palette de couleurs plus claires harmonisées avec l'herbe
    const colors = [
      '#6ba85e', // Vert clair principal (plus proche de l'herbe)
      '#5d9c52', // Vert moyen clair
      '#7bb86f', // Vert très clair
      '#62a557', // Vert olive clair
      '#5a9851', // Vert forest clair
      '#4f8947', // Vert plus soutenu
      '#6db361', // Vert vibrant clair
      '#58954d'  // Vert medium clair
    ];
    
    colors.forEach(color => {
      const material = new THREE.MeshStandardMaterial({
        color: color,
        alphaMap: foliageAlpha,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        roughness: 0.7, // Légèrement moins rugueux pour plus de brillance
        metalness: 0.05, // Réduit pour un aspect plus naturel
        shadowSide: THREE.DoubleSide
      });

      // Animation au vent pour les feuillages
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = 'uniform float time;\n' + shader.vertexShader;
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
          
          // Animation plus réaliste pour les feuillages
          float windTime = time * 0.8 + instanceRandom.x * 6.28;
          float windStrength = sin(windTime + worldPos.x * 0.05 + worldPos.z * 0.05) * 0.02;
          float windStrength2 = sin(windTime * 1.3 + worldPos.x * 0.03) * 0.015;
          
          // Plus de mouvement en hauteur (feuilles)
          float heightFactor = max(0.0, position.y + 0.5) * 0.8;
          float sideFactor = abs(position.x) + abs(position.z);
          
          transformed.x += (windStrength + windStrength2) * heightFactor * (1.0 + sideFactor);
          transformed.z += windStrength * 0.7 * heightFactor * (1.0 + sideFactor);
          transformed.y += windStrength * 0.3 * heightFactor;`
        );
      };

      materials.push(material);
    });
    
    return materials;
  }, [timeUniform, foliageAlpha]);

  // Initialisation des instances
  useEffect(() => {
    if (!foliageAlpha || bushMaterials.length === 0) return;
    
    instancedMeshRefs.current = [];
    
    // Répartir les buissons entre les différents types
    const countsPerType = [
      Math.floor(count * 0.3), // 30% buissons moyens
      Math.floor(count * 0.25), // 25% petites touffes
      Math.floor(count * 0.2),  // 20% buissons denses
      Math.floor(count * 0.15), // 15% petits détaillés
      Math.floor(count * 0.1)   // 10% grands buissons
    ];
    
    bushGeometries.forEach((geometry, typeIndex) => {
      const typeCount = countsPerType[typeIndex];
      if (typeCount === 0) return;
      
      const instancedMesh = new THREE.InstancedMesh(
        geometry,
        bushMaterials[typeIndex % bushMaterials.length],
        typeCount
      );
      
      const instanceRandoms = new Float32Array(typeCount * 3);
      
      for (let i = 0; i < typeCount; i++) {
        // Position aléatoire
        const x = (Math.random() - 0.5) * width;
        const z = (Math.random() - 0.5) * height;
        const groundHeight = calculateHeight(x, z, frequency, amplitude);
        
        dummyObj.position.set(x, groundHeight, z);
        dummyObj.rotation.y = Math.random() * Math.PI * 2;
        
        // Variations d'échelle selon le type
        let scaleVariation, heightVariation;
        switch (typeIndex) {
          case 0: // Buissons moyens
            scaleVariation = 0.8 + Math.random() * 0.6;
            heightVariation = 0.9 + Math.random() * 0.4;
            break;
          case 1: // Petites touffes
            scaleVariation = 0.6 + Math.random() * 0.4;
            heightVariation = 0.8 + Math.random() * 0.6;
            break;
          case 2: // Buissons denses
            scaleVariation = 0.9 + Math.random() * 0.5;
            heightVariation = 0.7 + Math.random() * 0.6;
            break;
          case 3: // Petits détaillés
            scaleVariation = 0.5 + Math.random() * 0.3;
            heightVariation = 0.8 + Math.random() * 0.4;
            break;
          case 4: // Grands buissons
            scaleVariation = 1.2 + Math.random() * 0.6;
            heightVariation = 0.8 + Math.random() * 0.5;
            break;
          default:
            scaleVariation = 1.0;
            heightVariation = 1.0;
        }
        
        dummyObj.scale.set(
          scaleVariation, 
          scaleVariation * heightVariation, 
          scaleVariation
        );
        
        dummyObj.updateMatrix();
        instancedMesh.setMatrixAt(i, dummyObj.matrix);
        
        // Données aléatoires pour l'animation
        instanceRandoms[i * 3] = Math.random();
        instanceRandoms[i * 3 + 1] = Math.random();
        instanceRandoms[i * 3 + 2] = Math.random();
      }
      
      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.geometry.setAttribute('instanceRandom', new THREE.InstancedBufferAttribute(instanceRandoms, 3));
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;
      instancedMesh.frustumCulled = false;
      
      instancedMeshRefs.current.push(instancedMesh);
    });
  }, [count, width, height, frequency, amplitude, position, dummyObj, bushGeometries, bushMaterials, foliageAlpha]);

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