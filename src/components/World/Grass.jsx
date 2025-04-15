import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';

// Vertex shader simplifié
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vColor;

  uniform float time;

  const float PI = 3.141592653589793;

  // Remap function
  float remap(float value, float low1, float high1, float low2, float high2) {
    return low2 + (value - low1) * (high2 - low2) / (high1 - low1);
  }

  // Ease-in function (power curve)
  float easIn(float t, float power) {
    return pow(t, power);
  }

  // Simple periodic noise function (placeholder for noise12)
  float noise12(vec2 p) {
     // Combine sin/cos based on input coords and time for variation
     return (sin(p.x * 2.0 + time * 0.8) + cos(p.y * 2.0 - time * 0.5)) * 0.5; // Outputs roughly -1 to 1
  }

  void main() {
    vUv = uv;
    vColor = color;

    vec3 pos = position;
    vec2 worldXZ = position.xz; // Use local XZ coordinates
    float heightPercent = color.r; // 0 at base, 1 at tip

    // Apply curvature before wind
    float curveNoise = noise12(worldXZ * 1.0 + 10.0); // Noise for variation
    float curveFactor = 0.15; // Adjust overall curve intensity
    float curveAmount = curveNoise * heightPercent * heightPercent * curveFactor;
    pos.x += curveAmount; // Apply curve offset (e.g., along X axis)

    // Calculate wind direction based on noise
    float windDirNoise = noise12(worldXZ * 0.5 + 0.05 * time);
    float windDir = remap(windDirNoise, -1.0, 1.0, 0.0, PI * 2.0);

    // Calculate wind lean angle based on different noise sample
    float windNoiseSample = noise12(worldXZ * 0.1 + time * 0.5); // Use different noise parameters
    float windLeanAngle = remap(windNoiseSample, -1.0, 1.0, 0.25, 1.0);
    windLeanAngle = easIn(windLeanAngle, 2.0) * 1.25; // Apply easing and amplify slightly

    // Apply wind displacement: direction * angle * color intensity * strength
    float windStrength = 0.3; // Adjust strength as needed
    pos.x += cos(windDir) * windLeanAngle * color.r * windStrength;
    pos.z += sin(windDir) * windLeanAngle * color.r * windStrength;

    // Original simpler wind effect (commented out)
    /*
    float windStrength = 0.2;
    float windSpeed = 1.5;
    float windEffect = sin(time * windSpeed + position.x * 10.0) * 
                       sin(time * 0.7 + position.z * 10.0) * 
                       color.r * windStrength;
    pos.x += windEffect;
    pos.z += windEffect * 0.6;
    */

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
    
    // Éclairage de base
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
    
    // Ajusté pour la performance et la densité visuelle
    const grassCount = density;
    
    // Paramètres des brins
    const bladesWidth = 0.1;
    const bladesHeight = 0.5;
    
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
      const midOffsetX = (Math.random() - 0.5) * 0.05; // Petit décalage aléatoire
      const midOffsetZ = (Math.random() - 0.5) * 0.05;
      positions.push(x + midOffsetX, bladesHeight * 0.5, z + midOffsetZ);
      normals.push(0, 1, 0);
      uvs.push(u, v);
      colors.push(0.5, 0.5, 0.5); // Bouge un peu
      
      // Haut
      const topOffsetX = (Math.random() - 0.5) * 0.1; // Décalage un peu plus grand pour le haut
      const topOffsetZ = (Math.random() - 0.5) * 0.1;
      positions.push(x + topOffsetX, bladesHeight, z + topOffsetZ);
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
  
  // Créer le material avec shader basique
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
      transparent: true,
    });
  }, [grassTexture, noiseTexture]);
  
  // Animer l'herbe
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.material.uniforms.time.value = clock.getElapsedTime();
    }
  });
  
  // Créer un plan pour recevoir les ombres sous l'herbe
  const groundMeshRef = useRef();

  return (
    <>
      {/* Herbe animée */}
      <mesh 
      ref={meshRef}
        position={position}
        geometry={geometry}
        material={material}
      />
      
      {/* Plan invisible qui reçoit les ombres */}
      <mesh 
        ref={groundMeshRef}
        position={[position[0], position[1] + 0.01, position[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
      >
        <planeGeometry args={[width, height]} />
        <shadowMaterial opacity={0.5} transparent />
      </mesh>
    </>
  );
}
