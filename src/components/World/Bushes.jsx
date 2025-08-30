import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { calculateHeight } from './Ground';

// Helper: gradient map for toon bands
function createToonGradientTexture(steps = 4) {
  const width = steps;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const v = Math.round((i / (width - 1)) * 255);
    const o = i * 4;
    data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true; return tex;
}

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

  // Texture de feuilles pour buissons
  const leavesTex = useTexture('/assets/textures/leaves/leaves.png');
  useEffect(() => {
    if (leavesTex) {
      leavesTex.wrapS = leavesTex.wrapT = THREE.RepeatWrapping;
      leavesTex.minFilter = THREE.LinearMipMapLinearFilter;
      leavesTex.magFilter = THREE.LinearFilter;
      leavesTex.anisotropy = 16;
      leavesTex.repeat.set(2, 2); // densifier le motif
    }
  }, [leavesTex]);

  // Gradient toon partagé
  const gradientMap = useMemo(() => createToonGradientTexture(4), []);

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
      const material = new THREE.MeshToonMaterial({
        color: color,
        map: leavesTex || null,
        alphaMap: leavesTex || null,
        transparent: false,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        dithering: true,
        gradientMap,
      });

      material.onBeforeCompile = (shader) => {
        shader.uniforms.time = timeUniform;
        shader.vertexShader = `
          uniform float time;
          attribute vec3 instanceRandom;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float t = time * (0.7 + instanceRandom.x * 0.6);
           float sway = sin(t + position.y * 1.4 + instanceRandom.y * 6.2831) * 0.06;
           float sway2 = sin(t * 1.9 + instanceRandom.z * 8.0) * 0.03;
           float h = max(0.0, position.y + 0.5);
           float s = (abs(position.x) + abs(position.z));
           transformed.x += (sway + sway2) * (0.6 + s) * h;
           transformed.z += sway * 0.5 * (0.6 + s) * h;`
        );
      };

      materials.push(material);
    });
    
    return materials;
  }, [timeUniform, leavesTex, gradientMap]);

  // Initialisation des instances
  useEffect(() => {
    if (bushMaterials.length === 0) return;
    
    instancedMeshRefs.current = [];
    
    // Répartir les buissons entre les différents types
    const countsPerType = [
      Math.floor(count * 0.3 * 4), // x4 densité
      Math.floor(count * 0.25 * 4),
      Math.floor(count * 0.2 * 4),
      Math.floor(count * 0.15 * 4),
      Math.floor(count * 0.1 * 4)
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
  }, [count, width, height, frequency, amplitude, position, dummyObj, bushGeometries, bushMaterials]);

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