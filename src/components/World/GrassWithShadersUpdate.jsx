import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { calculateHeight } from './Ground';

// Composant GrassGPT4 : herbe animée avec shaders personnalisés et support des ombres
export default function GrassGPT4({
  density = 10000,
  width = 50,
  height = 50,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1
}) {
  const meshRef = useRef();

  // Chargement des textures
  const grassTexture = useTexture('/assets/textures/grass.jpg');
  const noiseTexture = useTexture('/assets/textures/grass_density.png');

  // Uniforme temps pour animer le vent
  const timeUniform = useMemo(() => ({ value: 0 }), []);

  useEffect(() => {
    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
    noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  }, [grassTexture, noiseTexture]);

  // Création de la géométrie des brins d'herbe
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];

    const bladesWidth = 0.05;
    const bladesHeight = 0.5;
    const grassCount = Math.floor(density);

    for (let i = 0; i < grassCount; i++) {
      const x = (Math.random() - 0.5) * width;
      const z = (Math.random() - 0.5) * height;
      
      // Calculer la hauteur du terrain à cette position
      const groundHeight = calculateHeight(x, z, frequency, amplitude);
      
      const angle = Math.random() * Math.PI * 2;
      const baseIndex = positions.length / 3;

      // Bas gauche - ajuster pour suivre le terrain
      positions.push(
        x - Math.sin(angle) * bladesWidth / 2,
        groundHeight, // Hauteur du sol
        z - Math.cos(angle) * bladesWidth / 2
      );
      
      // Calculer une normale approximative (pour l'éclairage)
      const nx = -Math.sin(x * frequency) * amplitude * frequency;
      const nz = -Math.cos(z * frequency) * amplitude * frequency;
      const normalLength = Math.sqrt(nx * nx + 1 + nz * nz);
      normals.push(nx / normalLength, 1 / normalLength, nz / normalLength);
      
      uvs.push((x + width / 2) / width, (z + height / 2) / height);
      colors.push(0, 0, 0);

      // Bas droit - ajuster pour suivre le terrain
      positions.push(
        x + Math.sin(angle) * bladesWidth / 2,
        groundHeight, // Hauteur du sol
        z + Math.cos(angle) * bladesWidth / 2
      );
      normals.push(nx / normalLength, 1 / normalLength, nz / normalLength);
      uvs.push((x + width / 2) / width, (z + height / 2) / height);
      colors.push(0, 0, 0);

      // Milieu - ajuster pour suivre le terrain
      positions.push(x, groundHeight + bladesHeight * 0.5, z);
      normals.push(nx / normalLength, 1 / normalLength, nz / normalLength);
      uvs.push((x + width / 2) / width, (z + height / 2) / height);
      colors.push(0.5, 0.5, 0.5);

      // Sommet - ajuster pour suivre le terrain
      positions.push(x, groundHeight + bladesHeight, z);
      normals.push(nx / normalLength, 1 / normalLength, nz / normalLength);
      uvs.push((x + width / 2) / width, (z + height / 2) / height);
      colors.push(1, 1, 1);

      // Triangles
      indices.push(
        baseIndex,
        baseIndex + 1,
        baseIndex + 2,
        baseIndex + 1,
        baseIndex + 3,
        baseIndex + 2
      );
    }

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return geo;
  }, [density, width, height, frequency, amplitude]);

  // Material standard avec vent injecté via onBeforeCompile pour supporter ombres
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: grassTexture,
      alphaMap: noiseTexture,
      transparent: true,
      side: THREE.DoubleSide,
      vertexColors: true,
      alphaTest: 0.5
    });

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'uniform float time;\n' + shader.vertexShader;
      shader.uniforms.time = timeUniform;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float windNoise = sin(position.x * 2.0 + time * 0.8) * cos(position.z * 2.0 - time * 0.5);
         float strength = 0.3 * color.r;
         transformed.x += windNoise * strength;
         transformed.z += windNoise * strength;`
      );
    };

    return mat;
  }, [grassTexture, noiseTexture, timeUniform]);

  // Mise à jour de l'uniforme time pour l'animation du vent
  useFrame(({ clock }) => {
    timeUniform.value = clock.getElapsedTime();
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
    />
  );
}
