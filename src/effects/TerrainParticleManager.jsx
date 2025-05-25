import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import DirtParticleSystem from './DirtParticleSystem';
import FootstepParticleEffect from './FootstepParticleEffect';

// Système de gestion des effets de terrain
export default function TerrainParticleManager({
  playerRef,
  locomotion = 'idle',
  movementDirection = new THREE.Vector3(0, 0, 0),
  terrainType = 'dirt', // 'dirt', 'grass', 'stone', 'sand'
  enabled = true
}) {
  const [currentTerrain, setCurrentTerrain] = useState(terrainType);
  const lastFootstepTime = useRef(0);
  const footstepSide = useRef(0); // 0 = gauche, 1 = droite
  
  // Détection du terrain basée sur la position du joueur
  const detectTerrain = (playerPosition) => {
    // Pour l'instant, on assume que c'est de la terre
    // Plus tard, on pourrait faire un raycast vers le sol pour détecter le matériau
    return 'dirt';
  };

  // Configuration des effets par terrain
  const terrainConfigs = {
    dirt: {
      particleSystem: DirtParticleSystem,
      maxParticles: 200,
      emissionRate: 15,
      particleLifetime: 3.0,
      dustCloudEnabled: true,
      kickUpIntensity: 1.2
    },
    grass: {
      particleSystem: DirtParticleSystem, // On utilise le même pour l'instant
      maxParticles: 120,
      emissionRate: 8,
      particleLifetime: 2.0,
      dustCloudEnabled: false,
      kickUpIntensity: 0.6
    },
    stone: {
      particleSystem: DirtParticleSystem,
      maxParticles: 80,
      emissionRate: 6,
      particleLifetime: 1.5,
      dustCloudEnabled: true,
      kickUpIntensity: 0.8
    }
  };

  const config = terrainConfigs[currentTerrain] || terrainConfigs.dirt;
  const ParticleSystemComponent = config.particleSystem;

  // Mise à jour du terrain en temps réel
  useFrame(() => {
    if (playerRef?.current) {
      const detectedTerrain = detectTerrain(playerRef.current.position);
      if (detectedTerrain !== currentTerrain) {
        setCurrentTerrain(detectedTerrain);
      }
    }
  });

  return (
    <>
      {/* Système principal de particules de course continue */}
      <ParticleSystemComponent
        playerRef={playerRef}
        locomotion={locomotion}
        movementDirection={movementDirection}
        maxParticles={config.maxParticles}
        emissionRate={config.emissionRate}
        particleLifetime={config.particleLifetime}
        enabled={enabled}
      />
      
      {/* Effets de particules synchronisés avec les pas */}
      <FootstepParticleEffect
        playerRef={playerRef}
        locomotion={locomotion}
        movementDirection={movementDirection}
        enabled={enabled}
      />
      
      {/* Nuage de poussière supplémentaire désactivé temporairement */}
      {/* {config.dustCloudEnabled && locomotion === 'run' && (
        <DustCloudEffect
          playerRef={playerRef}
          movementDirection={movementDirection}
          intensity={config.kickUpIntensity}
        />
      )} */}
    </>
  );
}

// Composant pour l'effet de nuage de poussière
function DustCloudEffect({
  playerRef,
  movementDirection,
  intensity = 1.0
}) {
  const cloudRef = useRef();
  const particlesRef = useRef([]);
  const maxClouds = 30;
  
  // Géométrie simple pour les nuages de poussière
  const cloudGeometry = useMemo(() => {
    return new THREE.SphereGeometry(0.8, 8, 6);
  }, []);

  // Matériau pour les nuages de poussière
  const cloudMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.7, 0.6, 0.4),
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        
        // Animation de rotation et d'expansion
        float timeOffset = uTime + position.x * 0.1 + position.z * 0.1;
        float expansion = sin(timeOffset * 2.0) * 0.3 + 1.0;
        transformed *= expansion;
        
        // Mouvement vertical
        transformed.y += sin(timeOffset * 1.5) * 0.2;
        `
      );
    };

    return material;
  }, []);

  // Initialisation des nuages
  useEffect(() => {
    if (!cloudRef.current) return;

    const clouds = [];
    for (let i = 0; i < maxClouds; i++) {
      clouds.push({
        life: 0,
        maxLife: 2.0 + Math.random() * 1.5,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        scale: 0.5 + Math.random() * 0.8,
        active: false
      });
    }
    particlesRef.current = clouds;
  }, [maxClouds]);

  // Animation des nuages
  useFrame((state, delta) => {
    if (!playerRef?.current || !cloudRef.current) return;

    const currentTime = state.clock.getElapsedTime();
    
    // Mettre à jour le uniform de temps
    if (cloudMaterial.uniforms?.uTime) {
      cloudMaterial.uniforms.uTime.value = currentTime;
    }

    const playerPosition = playerRef.current.position;
    const isMoving = movementDirection.length() > 0.1;

    // Émettre des nuages occasionnellement
    if (isMoving && Math.random() < 0.1 * intensity) {
      // Trouver un nuage inactif
      const inactiveCloud = particlesRef.current.find(cloud => !cloud.active);
      if (inactiveCloud) {
        inactiveCloud.active = true;
        inactiveCloud.life = inactiveCloud.maxLife;
        
        // Position derrière le joueur
        const offset = movementDirection.clone().multiplyScalar(-1.5);
        offset.add(new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          0.2,
          (Math.random() - 0.5) * 2
        ));
        
        inactiveCloud.position.copy(playerPosition).add(offset);
        inactiveCloud.velocity.set(
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.8 + 0.3,
          (Math.random() - 0.5) * 0.5
        );
      }
    }

    // Mettre à jour les nuages actifs
    particlesRef.current.forEach((cloud, index) => {
      if (cloud.active) {
        cloud.life -= delta;
        
        if (cloud.life <= 0) {
          cloud.active = false;
          // Cacher le nuage
          const dummy = new THREE.Object3D();
          dummy.position.set(0, -1000, 0);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          cloudRef.current.setMatrixAt(index, dummy.matrix);
        } else {
          // Animer le nuage
          cloud.position.add(cloud.velocity.clone().multiplyScalar(delta));
          cloud.velocity.y -= delta * 0.5; // Gravité légère
          
          // Mise à jour de la matrice
          const dummy = new THREE.Object3D();
          dummy.position.copy(cloud.position);
          
          // Animation de la taille
          const lifeRatio = cloud.life / cloud.maxLife;
          const scaleAnimation = Math.sin(lifeRatio * Math.PI) * cloud.scale;
          dummy.scale.setScalar(scaleAnimation);
          
          dummy.updateMatrix();
          cloudRef.current.setMatrixAt(index, dummy.matrix);
        }
      }
    });

    if (cloudRef.current.instanceMatrix) {
      cloudRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={cloudRef}
      args={[cloudGeometry, cloudMaterial, maxClouds]}
      frustumCulled={false}
    />
  );
} 