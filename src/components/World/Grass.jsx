import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';

// Vertex shader corrigé
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vColor;
  
  uniform float time;
  
  void main() {
    vUv = uv;
    vColor = color;
    
    vec3 pos = position;
    
    // Animation basée sur la couleur du vertex (blanc au sommet, noir à la base)
    float windStrength = 0.2;
    float windSpeed = 1.5;
    
    // Calcul du mouvement du vent
    float windEffect = sin(time * windSpeed + position.x * 10.0) * 
                       sin(time * 0.7 + position.z * 10.0) * 
                       color.r * windStrength;
    
    // Appliquer le mouvement seulement sur les x et z
    pos.x += windEffect;
    pos.z += windEffect * 0.6;
    
    // Position finale
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

// Fragment shader simplifié
const fragmentShader = `
  uniform sampler2D grassTexture;
  uniform sampler2D noiseTexture;
  
  varying vec2 vUv;
  varying vec3 vColor;
  
  void main() {
    vec4 grassColor = texture2D(grassTexture, vUv);
    vec4 noise = texture2D(noiseTexture, vUv);
    
    // Ajout d'ombres et éclairage simple
    float shadow = mix(0.7, 1.0, noise.r);
    float light = 0.3 + 0.7 * vColor.r;
    
    vec3 finalColor = grassColor.rgb * shadow * light;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export default function GrassField({ 
  density = 1.5,
  width = 100,
  height = 100,
  position = [0, -1, 0]
}) {
  const meshRef = useRef();
  
  // Chargement des textures
  const grassTexture = useTexture('/assets/textures/grass.jpg');
  const noiseTexture = useTexture('/assets/textures/grass_density.png');
  
  // Configurer les textures
  useEffect(() => {
    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
    noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  }, [grassTexture, noiseTexture]);
  
  // Créer la géométrie de l'herbe
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    
    // Nombre de brins d'herbe
    const grassCount = Math.floor(width * height * density / 10);
    
    // Paramètres des brins
    const bladesWidth = 0.1;
    const bladesHeight = 0.8;
    
    for (let i = 0; i < grassCount; i++) {
      // Position aléatoire
      const x = (Math.random() - 0.5) * width;
      const z = (Math.random() - 0.5) * height;
      
      // Rotation aléatoire
      const angle = Math.random() * Math.PI * 2;
      
      // Coordonnées UV normalisées
      const u = (x + width/2) / width;
      const v = (z + height/2) / height;
      
      // Index de base pour ce brin d'herbe
      const baseIndex = positions.length / 3;
      
      // Bas gauche
      positions.push(x - Math.sin(angle) * bladesWidth/2, 0, z - Math.cos(angle) * bladesWidth/2);
      normals.push(0, 1, 0);
      uvs.push(u, v);
      colors.push(0, 0, 0); // Ne bouge pas
      
      // Bas droit
      positions.push(x + Math.sin(angle) * bladesWidth/2, 0, z + Math.cos(angle) * bladesWidth/2);
      normals.push(0, 1, 0);
      uvs.push(u, v);
      colors.push(0, 0, 0); // Ne bouge pas
      
      // Milieu
      positions.push(x, bladesHeight * 0.5, z);
      normals.push(0, 1, 0);
      uvs.push(u, v);
      colors.push(0.5, 0.5, 0.5); // Bouge un peu
      
      // Haut
      positions.push(x, bladesHeight, z);
      normals.push(0, 1, 0);
      uvs.push(u, v);
      colors.push(1, 1, 1); // Bouge le plus
      
      // Triangles
      indices.push(
        baseIndex, baseIndex + 1, baseIndex + 2,
        baseIndex + 1, baseIndex + 3, baseIndex + 2
      );
    }
    
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    return geo;
  }, [width, height, density]);
  
  // Créer le material avec les shaders
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        grassTexture: { value: grassTexture },
        noiseTexture: { value: noiseTexture },
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
  }, [grassTexture, noiseTexture]);
  
  // Animer l'herbe
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.material.uniforms.time.value = clock.getElapsedTime();
    }
  });
  
  return (
    <mesh 
      ref={meshRef} 
      position={position}
      castShadow
      receiveShadow
    >
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
