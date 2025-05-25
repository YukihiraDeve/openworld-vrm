import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

// Pool d'objets pour optimiser les performances
const tempVector3 = new THREE.Vector3();
const tempMatrix4 = new THREE.Matrix4();
const tempColor = new THREE.Color();

export default function DirtParticleSystem({
  playerRef,
  locomotion = 'idle',
  movementDirection = new THREE.Vector3(0, 0, 0),
  maxParticles = 150,
  emissionRate = 8, // particules par seconde en course
  particleLifetime = 2.5,
  enabled = true
}) {
  const instancedMeshRef = useRef();
  const particleDataRef = useRef([]);
  const lastEmissionTime = useRef(0);
  const lastPlayerPosition = useRef(new THREE.Vector3());
  const lastPlayerVelocity = useRef(new THREE.Vector3());
  const emissionQueue = useRef([]);
  
  // Chargement des textures de terre avec les assets disponibles
  const dirtTextures = useTexture([
    '/assets/particle/dirt_01.png',
    '/assets/particle/dirt_02.png',
    '/assets/particle/dirt_03.png'
  ]);

  // Géométrie des particules optimisée pour les textures de terre
  const particleGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(0.4, 0.4);
    
    // Créer des UVs qui couvrent toute la texture pour voir la forme
    const uvs = new Float32Array([
      0, 0,   // coin bas-gauche
      1, 0,   // coin bas-droite  
      0, 1,   // coin haut-gauche
      1, 1    // coin haut-droite
    ]);
    
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    return geometry;
  }, []);

  // Matériau des particules avec shader personnalisé
  const particleMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      map: dirtTextures[0], // Texture principale
      alphaMap: dirtTextures[0], // Utiliser la même texture pour l'alpha
      transparent: true,
      alphaTest: 0.3, // Plus élevé pour mieux découper la forme
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });

    // Shader personnalisé pour les effets avancés
    material.onBeforeCompile = (shader) => {
      // Ajouter des uniforms personnalisés
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uDirtTexture1 = { value: dirtTextures[1] };
      shader.uniforms.uDirtTexture2 = { value: dirtTextures[2] };
      
      // Variables d'instance personnalisées
      shader.vertexShader = `
        uniform float uTime;
        attribute float particleLife;
        attribute float particleMaxLife;
        attribute vec3 particleVelocity;
        attribute float particleRotation;
        attribute float particleSize;
        attribute float textureIndex;
        
        varying float vLife;
        varying float vAlpha;
        varying float vTextureIndex;
        varying vec2 vRotatedUv;
        
        ${shader.vertexShader}
      `;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        
        // Calcul du ratio de vie
        vLife = particleLife / particleMaxLife;
        vTextureIndex = textureIndex;
        
        // Animation de la taille (commence petit, grandit, puis rétrécit)
        float sizeAnimation = sin(vLife * 3.14159) * 0.8 + 0.2;
        transformed *= particleSize * sizeAnimation;
        
        // Rotation de la particule
        float cosR = cos(particleRotation + uTime * 0.5);
        float sinR = sin(particleRotation + uTime * 0.5);
        float newX = transformed.x * cosR - transformed.y * sinR;
        float newY = transformed.x * sinR + transformed.y * cosR;
        transformed.x = newX;
        transformed.y = newY;
        
        // Animation de la chute avec gravité
        float gravity = -4.9 * vLife * vLife;
        transformed.y += gravity;
        
        // Mouvement basé sur la vélocité initiale
        transformed += particleVelocity * vLife;
        
        // Calcul de l'alpha (fade out vers la fin de vie)
        vAlpha = 1.0 - smoothstep(0.7, 1.0, vLife);
        
        // Rotation des UVs pour la variation
        vRotatedUv = uv;
        `
      );

      shader.fragmentShader = `
        uniform sampler2D uDirtTexture1;
        uniform sampler2D uDirtTexture2;
        uniform float uTime;
        
        varying float vLife;
        varying float vAlpha;
        varying float vTextureIndex;
        varying vec2 vRotatedUv;
        
        ${shader.fragmentShader}
      `;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        // Sélection de texture basée sur l'index
        vec4 dirtColor;
        if (vTextureIndex < 0.33) {
          dirtColor = texture2D(map, vRotatedUv);
        } else if (vTextureIndex < 0.66) {
          dirtColor = texture2D(uDirtTexture1, vRotatedUv);
        } else {
          dirtColor = texture2D(uDirtTexture2, vRotatedUv);
        }
        
        // Variation de couleur dynamique
        vec3 baseColor = mix(
          vec3(0.4, 0.3, 0.2), // Brun foncé
          vec3(0.7, 0.5, 0.3), // Brun clair
          sin(uTime + vLife * 10.0) * 0.3 + 0.7
        );
        
        diffuseColor = vec4(dirtColor.rgb * baseColor, dirtColor.a * vAlpha);
        `
      );
    };

    return material;
  }, [dirtTextures]);

  // Initialiser les particules
  useEffect(() => {
    if (!instancedMeshRef.current) return;

    const particleData = [];
    const dummy = new THREE.Object3D();

    // Créer les attributs d'instance
    const particleLifeArray = new Float32Array(maxParticles);
    const particleMaxLifeArray = new Float32Array(maxParticles);
    const particleVelocityArray = new Float32Array(maxParticles * 3);
    const particleRotationArray = new Float32Array(maxParticles);
    const particleSizeArray = new Float32Array(maxParticles);
    const textureIndexArray = new Float32Array(maxParticles);

    for (let i = 0; i < maxParticles; i++) {
      // Initialiser les particules comme inactives
      particleLifeArray[i] = -1;
      particleMaxLifeArray[i] = particleLifetime;
      particleVelocityArray[i * 3] = 0;
      particleVelocityArray[i * 3 + 1] = 0;
      particleVelocityArray[i * 3 + 2] = 0;
      particleRotationArray[i] = Math.random() * Math.PI * 2;
      particleSizeArray[i] = 0.8 + Math.random() * 0.4;
      textureIndexArray[i] = Math.random();

      // Position initiale cachée
      dummy.position.set(0, -1000, 0);
      dummy.updateMatrix();
      instancedMeshRef.current.setMatrixAt(i, dummy.matrix);

      particleData.push({
        life: -1,
        maxLife: particleLifetime,
        velocity: new THREE.Vector3(0, 0, 0),
        rotation: particleRotationArray[i],
        size: particleSizeArray[i],
        textureIndex: textureIndexArray[i],
        active: false
      });
    }

    // Appliquer les attributs
    instancedMeshRef.current.geometry.setAttribute(
      'particleLife', 
      new THREE.InstancedBufferAttribute(particleLifeArray, 1)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'particleMaxLife', 
      new THREE.InstancedBufferAttribute(particleMaxLifeArray, 1)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'particleVelocity', 
      new THREE.InstancedBufferAttribute(particleVelocityArray, 3)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'particleRotation', 
      new THREE.InstancedBufferAttribute(particleRotationArray, 1)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'particleSize', 
      new THREE.InstancedBufferAttribute(particleSizeArray, 1)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'textureIndex', 
      new THREE.InstancedBufferAttribute(textureIndexArray, 1)
    );

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    particleDataRef.current = particleData;
  }, [maxParticles, particleLifetime]);

  // Fonction pour émettre une nouvelle particule
  const emitParticle = (position, velocity, intensity = 1.0) => {
    const particles = particleDataRef.current;
    
    // Trouver une particule inactive
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (!particle.active) {
        // Configurer la nouvelle particule
        particle.active = true;
        particle.life = particle.maxLife * (0.8 + Math.random() * 0.4);
        particle.textureIndex = Math.random();
        
        // Position de spawn avec variation relative au joueur - plus haute
        const spawnOffset = new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          0.2 + Math.random() * 0.3, // Commencer plus haut
          (Math.random() - 0.5) * 0.3
        );
        
        // Vélocité basée sur le mouvement du joueur + variation aléatoire - plus haute
        const baseVelocity = velocity.clone().multiplyScalar(0.3 + Math.random() * 0.4);
        const randomVelocity = new THREE.Vector3(
          (Math.random() - 0.5) * 2.5 * intensity,
          Math.random() * 2.5 * intensity + 1.0, // Plus de hauteur
          (Math.random() - 0.5) * 2.5 * intensity
        );
        
        particle.velocity.copy(baseVelocity.add(randomVelocity));
        
        // Mettre à jour la position et la matrice
        const dummy = new THREE.Object3D();
        dummy.position.copy(position).add(spawnOffset);
        dummy.updateMatrix();
        instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
        
        // Mettre à jour les attributs
        const lifeAttribute = instancedMeshRef.current.geometry.attributes.particleLife;
        const velocityAttribute = instancedMeshRef.current.geometry.attributes.particleVelocity;
        const textureAttribute = instancedMeshRef.current.geometry.attributes.textureIndex;
        
        lifeAttribute.setX(i, particle.life);
        velocityAttribute.setXYZ(i, particle.velocity.x, particle.velocity.y, particle.velocity.z);
        textureAttribute.setX(i, particle.textureIndex);
        
        lifeAttribute.needsUpdate = true;
        velocityAttribute.needsUpdate = true;
        textureAttribute.needsUpdate = true;
        instancedMeshRef.current.instanceMatrix.needsUpdate = true;
        
        break;
      }
    }
  };

  // Animation et logique principale
  useFrame((state, delta) => {
    if (!enabled || !playerRef?.current || !instancedMeshRef.current) return;

    const currentTime = state.clock.getElapsedTime();
    
    // Mettre à jour le uniform de temps pour les shaders
    if (particleMaterial.uniforms?.uTime) {
      particleMaterial.uniforms.uTime.value = currentTime;
    }

    // Utiliser la position du corps physique pour plus de précision
    const playerPosition = playerRef.current.rigidBodyRef?.current?.translation() 
      ? new THREE.Vector3().copy(playerRef.current.rigidBodyRef.current.translation())
      : playerRef.current.position;
      
    const currentVelocity = tempVector3.copy(playerPosition).sub(lastPlayerPosition.current).divideScalar(delta);
    
    // Détecter si le joueur court et est en mouvement
    const isRunning = locomotion === 'run';
    const isMoving = movementDirection.length() > 0.1;
    const shouldEmit = isRunning && isMoving;
    
    // Intensité basée sur la vitesse
    const velocityMagnitude = currentVelocity.length();
    const emissionIntensity = Math.min(velocityMagnitude / 3.0, 2.0);
    
    // Émission de nouvelles particules
    if (shouldEmit && currentTime - lastEmissionTime.current > (1.0 / (emissionRate * emissionIntensity))) {
      // Position des pieds attachée au joueur - plus haute
      const footPosition = new THREE.Vector3();
      footPosition.copy(playerPosition);
      footPosition.y -= 0.5; // Juste légèrement sous le joueur
      
      // Rotation du joueur pour orienter correctement les pieds
      const playerRotation = playerRef.current.rotation || { y: 0 };
      
      // Ajouter de la variation pour simuler les deux pieds alternés
      const stepPhase = Math.sin(currentTime * 10) * 0.5;
      const sideOffset = stepPhase * 0.25;
      
      // Appliquer la rotation du joueur pour les pieds
      const localFootOffset = new THREE.Vector3(sideOffset, 0, -0.2);
      localFootOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRotation.y);
      footPosition.add(localFootOffset);
      
      emitParticle(footPosition, currentVelocity, emissionIntensity);
      lastEmissionTime.current = currentTime;
    }

    // Mettre à jour les particules existantes
    const particles = particleDataRef.current;
    const lifeAttribute = instancedMeshRef.current.geometry.attributes.particleLife;
    
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (particle.active) {
        particle.life -= delta;
        
        if (particle.life <= 0) {
          // Particule morte
          particle.active = false;
          particle.life = -1;
          
          // Cacher la particule
          const dummy = new THREE.Object3D();
          dummy.position.set(0, -1000, 0);
          dummy.updateMatrix();
          instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
        }
        
        // Mettre à jour l'attribut de vie
        lifeAttribute.setX(i, particle.life);
      }
    }
    
    lifeAttribute.needsUpdate = true;
    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    
    // Sauvegarder la position actuelle
    lastPlayerPosition.current.copy(playerPosition);
    lastPlayerVelocity.current.copy(currentVelocity);
  });

  if (!enabled) return null;

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[particleGeometry, particleMaterial, maxParticles]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
} 