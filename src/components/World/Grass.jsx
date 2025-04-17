import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';

export default function GrassField({ density = 100000, width = 50, height = 50, position = [0, -1, 0] }) {
  const meshRef = useRef();
  const groundRef = useRef();

  // Chargement des textures
  const grassTexture = useTexture('/assets/textures/grass.jpg');
  const noiseTexture = useTexture('/assets/textures/grass_density2.png');

  useEffect(() => {
    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
    noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  }, [grassTexture, noiseTexture]);

  // Géométrie de l'herbe
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    const bladesWidth = 0.1;
    const bladesHeight = 0.5;

    for (let i = 0; i < density; i++) {
      const x = (Math.random() - 0.5) * width;
      const z = (Math.random() - 0.5) * height;
      const angle = Math.random() * Math.PI * 2;
      const u = (x + width / 2) / width;
      const v = (z + height / 2) / height;
      const base = positions.length / 3;

      // Quatre sommets d'un brin
      positions.push(
        x - Math.sin(angle) * bladesWidth / 2,
        0,
        z - Math.cos(angle) * bladesWidth / 2
      );
      positions.push(
        x + Math.sin(angle) * bladesWidth / 2,
        0,
        z + Math.cos(angle) * bladesWidth / 2
      );
      positions.push(x, bladesHeight * 0.5, z);
      positions.push(x, bladesHeight, z);

      // Normales, UVs et couleurs
      for (let j = 0; j < 4; j++) {
        normals.push(0, 1, 0);
        uvs.push(u, v);
      }
      colors.push(0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 1);

      // Triangles
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return geo;
  }, [density, width, height]);

  // Material basé sur MeshStandard pour bénéficier des ombres natives
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: grassTexture,
      alphaMap: noiseTexture,
      transparent: true,
      side: THREE.DoubleSide,
      vertexColors: true,
      alphaTest: 0.5
    });

    // Injection du vent via onBeforeCompile
    mat.onBeforeCompile = (shader) => {
      // Ajout de l'uniforme time
      shader.uniforms.time = { value: 0 };
      // Préfixe dans le vertex shader
      shader.vertexShader = 'uniform float time;\n' + shader.vertexShader;
      // Injection du sway dans begin_vertex
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n      float sway = sin(transformed.x * 5.0 + time * 0.5) * 0.1 * color.r;\n      transformed.x += sway;`
      );
      // Stockage du shader pour mise à jour
      mat.userData.shader = shader;
    };

    return mat;
  }, [grassTexture, noiseTexture]);

  // Mise à jour de l'uniforme time chaque frame
  useFrame(({ clock }) => {
    const shader = material.userData.shader;
    if (shader) shader.uniforms.time.value = clock.getElapsedTime();
  });

  return (
    <>
      {/* Herbe animée */}
      <mesh
        ref={meshRef}
        position={position}
        geometry={geometry}
        material={material}
        receiveShadow
      />

      {/* Plan invisible pour recevoir l’ombre globale */}
      <mesh
        ref={groundRef}
        position={[position[0], position[1] + 0.01, position[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[width, height]} />
        <shadowMaterial transparent opacity={0.7} />
      </mesh>
    </>
  );
}
