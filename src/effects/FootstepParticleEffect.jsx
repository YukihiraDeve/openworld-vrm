import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

// Intervalles de pas (synchronisés avec FootstepAudio)
const WALK_STEP_INTERVAL = 0.5;
const RUN_STEP_INTERVAL = 0.3;

export default function FootstepParticleEffect({
  playerRef,
  locomotion = 'idle',
  movementDirection = new THREE.Vector3(0, 0, 0),
  enabled = true
}) {
  const instancedMeshRef = useRef();
  const lastStepTime = useRef(0);
  const footSide = useRef(0); // 0 = gauche, 1 = droite
  const particlePoolRef = useRef([]);
  const maxParticles = 100;

  // Chargement des textures
  const dirtTextures = useTexture([
    '/assets/particle/dirt_01.png',
    '/assets/particle/dirt_02.png',
    '/assets/particle/dirt_03.png'
  ]);

  // Géométrie pour les particules de pas avec forme optimisée
  const stepGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(0.6, 0.6); // Plus grosses particules
    
    // UVs optimisés pour montrer la forme complète de la texture
    const uvs = new Float32Array([
      0, 0,   // coin bas-gauche
      1, 0,   // coin bas-droite  
      0, 1,   // coin haut-gauche
      1, 1    // coin haut-droite
    ]);
    
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geometry;
  }, []);

  // Matériau avec effet de "splash" au sol et variation de textures
  const stepMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      map: dirtTextures[0],
      alphaMap: dirtTextures[0], // Utiliser la texture pour l'alpha aussi
      transparent: true,
      alphaTest: 0.4, // Plus élevé pour bien découper la forme
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uDirtTexture1 = { value: dirtTextures[1] };
      shader.uniforms.uDirtTexture2 = { value: dirtTextures[2] };
      
      shader.vertexShader = `
        uniform float uTime;
        attribute float stepLife;
        attribute float stepMaxLife;
        attribute vec3 stepVelocity;
        attribute float stepSize;
        attribute float stepRotation;
        attribute float textureIndex;
        
        varying float vStepLife;
        varying float vStepAlpha;
        varying vec2 vRotatedUv;
        varying float vTextureIndex;
        
        ${shader.vertexShader}
      `;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        
        vStepLife = stepLife / stepMaxLife;
        vTextureIndex = textureIndex;
        
        // Animation de "burst" avec crescendo puis disparition
        float burstPhase = 1.0 - vStepLife;
        float sizeMultiplier = sin(burstPhase * 3.14159 * 0.8) * stepSize * 1.2; // Plus grosse et plus lente
        transformed *= sizeMultiplier;
        
        // Rotation
        float cosR = cos(stepRotation);
        float sinR = sin(stepRotation);
        float newX = transformed.x * cosR - transformed.y * sinR;
        float newY = transformed.x * sinR + transformed.y * cosR;
        transformed.x = newX;
        transformed.y = newY;
        
        // Mouvement radial depuis le point d'impact
        transformed += stepVelocity * burstPhase * 0.5;
        
        // Alpha fade out plus progressif pour voir les grosses particules
        vStepAlpha = smoothstep(0.0, 0.2, burstPhase) * smoothstep(1.0, 0.6, burstPhase);
        
        // Passer les UVs
        vRotatedUv = uv;
        `
      );

      shader.fragmentShader = `
        uniform float uTime;
        uniform sampler2D uDirtTexture1;
        uniform sampler2D uDirtTexture2;
        varying float vStepLife;
        varying float vStepAlpha;
        varying vec2 vRotatedUv;
        varying float vTextureIndex;
        
        ${shader.fragmentShader}
      `;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        // Sélection de texture selon l'index
        vec4 texColor;
        if (vTextureIndex < 0.33) {
          texColor = texture2D(map, vRotatedUv);
        } else if (vTextureIndex < 0.66) {
          texColor = texture2D(uDirtTexture1, vRotatedUv);
        } else {
          texColor = texture2D(uDirtTexture2, vRotatedUv);
        }
        
        // Couleur de terre variable
        vec3 dirtColor = mix(
          vec3(0.4, 0.3, 0.2),
          vec3(0.7, 0.5, 0.3),
          sin(uTime * 2.0 + vStepLife * 15.0) * 0.5 + 0.5
        );
        
        diffuseColor = vec4(texColor.rgb * dirtColor, texColor.a * vStepAlpha);
        `
      );
    };

    return material;
  }, [dirtTextures]);

  // Initialisation du pool de particules
  useEffect(() => {
    if (!instancedMeshRef.current) return;

    const particles = [];
    const dummy = new THREE.Object3D();

    // Attributs pour les particules de pas
    const stepLifeArray = new Float32Array(maxParticles);
    const stepMaxLifeArray = new Float32Array(maxParticles);
    const stepVelocityArray = new Float32Array(maxParticles * 3);
    const stepSizeArray = new Float32Array(maxParticles);
    const stepRotationArray = new Float32Array(maxParticles);
    const textureIndexArray = new Float32Array(maxParticles);

    for (let i = 0; i < maxParticles; i++) {
      stepLifeArray[i] = -1;
      stepMaxLifeArray[i] = 1.2; // Vie plus longue pour voir les grosses particules
      stepVelocityArray[i * 3] = 0;
      stepVelocityArray[i * 3 + 1] = 0;
      stepVelocityArray[i * 3 + 2] = 0;
      stepSizeArray[i] = 1.2 + Math.random() * 0.6; // Taille plus grande
      stepRotationArray[i] = Math.random() * Math.PI * 2;
      textureIndexArray[i] = Math.random();

      // Position cachée
      dummy.position.set(0, -1000, 0);
      dummy.updateMatrix();
      instancedMeshRef.current.setMatrixAt(i, dummy.matrix);

      particles.push({
        life: -1,
        maxLife: 1.2,
        velocity: new THREE.Vector3(),
        size: stepSizeArray[i],
        rotation: stepRotationArray[i],
        textureIndex: textureIndexArray[i],
        active: false
      });
    }

    // Appliquer les attributs
    instancedMeshRef.current.geometry.setAttribute(
      'stepLife',
      new THREE.InstancedBufferAttribute(stepLifeArray, 1)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'stepMaxLife',
      new THREE.InstancedBufferAttribute(stepMaxLifeArray, 1)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'stepVelocity',
      new THREE.InstancedBufferAttribute(stepVelocityArray, 3)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'stepSize',
      new THREE.InstancedBufferAttribute(stepSizeArray, 1)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'stepRotation',
      new THREE.InstancedBufferAttribute(stepRotationArray, 1)
    );
    instancedMeshRef.current.geometry.setAttribute(
      'textureIndex',
      new THREE.InstancedBufferAttribute(textureIndexArray, 1)
    );

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    particlePoolRef.current = particles;
  }, [maxParticles]);

  // Créer un effet de pas
  const createFootstepBurst = (position, direction, isRunning) => {
    const particles = particlePoolRef.current;
    const numParticles = isRunning ? 8 : 5;
    
    for (let i = 0; i < numParticles; i++) {
      // Trouver une particule inactive
      const particle = particles.find(p => !p.active);
      if (!particle) break;

      const particleIndex = particles.indexOf(particle);
      
      // Activer la particule
      particle.active = true;
              particle.life = particle.maxLife * (0.9 + Math.random() * 0.2); // Petite variation de durée

      // Position avec offset pour simuler la forme du pied - plus haute
      const footOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        0.3 + Math.random() * 0.2, // Commencer plus haut
        (Math.random() - 0.5) * 0.2
      );

      // Vélocité radiale depuis le point d'impact avec beaucoup plus de hauteur
      const angle = (Math.PI * 2 * i) / numParticles + Math.random() * 0.5;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * (1.2 + Math.random() * 0.8),
        Math.random() * 2.0 + 1.5, // Beaucoup plus de hauteur
        Math.sin(angle) * (1.2 + Math.random() * 0.8)
      );
      
      if (isRunning) {
        velocity.multiplyScalar(1.8); // Plus d'intensité pour la course
        velocity.y += 1.0; // Encore beaucoup plus haut quand on court
      }

      particle.velocity.copy(velocity);

      // Mettre à jour la position
      const dummy = new THREE.Object3D();
      dummy.position.copy(position).add(footOffset);
      dummy.updateMatrix();
      instancedMeshRef.current.setMatrixAt(particleIndex, dummy.matrix);

      // Mettre à jour les attributs
      const lifeAttribute = instancedMeshRef.current.geometry.attributes.stepLife;
      const velocityAttribute = instancedMeshRef.current.geometry.attributes.stepVelocity;

      lifeAttribute.setX(particleIndex, particle.life);
      velocityAttribute.setXYZ(
        particleIndex,
        particle.velocity.x,
        particle.velocity.y,
        particle.velocity.z
      );

      lifeAttribute.needsUpdate = true;
      velocityAttribute.needsUpdate = true;
      instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  };

  // Animation principale
  useFrame((state, delta) => {
    if (!enabled || !playerRef?.current || !instancedMeshRef.current) return;

    const currentTime = state.clock.getElapsedTime();
    
    // Mettre à jour le uniform de temps
    if (stepMaterial.uniforms?.uTime) {
      stepMaterial.uniforms.uTime.value = currentTime;
    }

    // Utiliser la position du corps physique pour plus de précision
    const playerPosition = playerRef.current.rigidBodyRef?.current?.translation() 
      ? new THREE.Vector3().copy(playerRef.current.rigidBodyRef.current.translation())
      : playerRef.current.position;
      
    const isWalking = locomotion === 'walk';
    const isRunning = locomotion === 'run';
    const isMoving = movementDirection.length() > 0.1;

    // Détecter les pas basés sur l'intervalle
    if ((isWalking || isRunning) && isMoving) {
      const stepInterval = isRunning ? RUN_STEP_INTERVAL : WALK_STEP_INTERVAL;
      
      if (currentTime - lastStepTime.current >= stepInterval) {
        // Position du pied attachée au joueur - plus haute
        const footPosition = new THREE.Vector3();
        footPosition.copy(playerPosition);
        footPosition.y -= 0.5; // Juste légèrement sous le joueur
        
        // Rotation du joueur pour orienter les pieds
        const playerRotation = playerRef.current.rotation || { y: 0 };
        
        // Décalage latéral pour l'alternance des pieds (gauche/droite)
        const sideOffset = footSide.current === 0 ? -0.25 : 0.25;
        
        // Position locale du pied par rapport au joueur
        const localFootOffset = new THREE.Vector3(sideOffset, 0, 0.1);
        
        // Appliquer la rotation du joueur
        localFootOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerRotation.y);
        footPosition.add(localFootOffset);

        // Créer l'effet de burst
        createFootstepBurst(footPosition, movementDirection, isRunning);

        // Alterner les pieds et mettre à jour le timing
        footSide.current = 1 - footSide.current;
        lastStepTime.current = currentTime;
      }
    }

    // Mettre à jour les particules actives
    const particles = particlePoolRef.current;
    const lifeAttribute = instancedMeshRef.current.geometry.attributes.stepLife;

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (particle.active) {
        particle.life -= delta;

        if (particle.life <= 0) {
          particle.active = false;
          particle.life = -1;

          // Cacher la particule
          const dummy = new THREE.Object3D();
          dummy.position.set(0, -1000, 0);
          dummy.updateMatrix();
          instancedMeshRef.current.setMatrixAt(i, dummy.matrix);
        }

        lifeAttribute.setX(i, particle.life);
      }
    }

    lifeAttribute.needsUpdate = true;
    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!enabled) return null;

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[stepGeometry, stepMaterial, maxParticles]}
      frustumCulled={false}
      renderOrder={1}
    />
  );
} 