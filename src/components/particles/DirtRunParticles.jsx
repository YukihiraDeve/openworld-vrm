import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { Path } from '../World/Paths';
import { calculateHeight } from '../World/Ground';

// Intervalle des "pas" en course
const RUN_STEP_INTERVAL_SECONDS = 0.25;
const MAX_PARTICLES = 150;

// Shader pour les particules (Points) pour un rendu ultra-rapide (1 Draw Call)
const particlesVertexShader = `
attribute float size;
attribute float opacity;
varying float vOpacity;
void main() {
  vOpacity = opacity;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // Taille adaptée à la distance (attenuation)
  gl_PointSize = size * (300.0 / -mvPosition.z);
}
`;

const particlesFragmentShader = `
uniform sampler2D map;
varying float vOpacity;
void main() {
  vec4 texColor = texture2D(map, gl_PointCoord);
  if (texColor.a < 0.1) discard; // Alpha test
  gl_FragColor = vec4(texColor.rgb, texColor.a * vOpacity);
}
`;

export default function DirtRunParticles({ targetRef, locomotion, movementDirection, paths }) {
  const { scene } = useThree();
  const texture = useTexture('/assets/particle/dirt_01.png');

  // Refs pour la logique système
  const geometryRef = useRef(null);
  const materialRef = useRef(null);
  const pointsRef = useRef(null);

  // Données des particules (CPU side simulation state)
  const particlesData = useRef([]);
  const lastSpawnTimeRef = useRef(0);

  // Pré-calculer les objets Path
  const pathObjects = useMemo(() => {
    if (!paths) return [];
    return paths.map(p => new Path(p.type, p.points, p.width, p.material));
  }, [paths]);

  // Initialisation du système de particules (Points)
  useEffect(() => {
    // 1. Initialiser l'état de simulation
    const data = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      data.push({
        active: false,
        life: 0,
        maxLife: 1,
        velocity: new THREE.Vector3(),
        groundY: 0
      });
    }
    particlesData.current = data;

    // 2. Créer la géométrie avec buffers
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const sizes = new Float32Array(MAX_PARTICLES);
    const opacities = new Float32Array(MAX_PARTICLES);

    // Initialiser hors champ
    for (let i = 0; i < MAX_PARTICLES; i++) {
      positions[i * 3 + 1] = -1000; // Y = -1000 (caché sous le sol)
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

    geometryRef.current = geo;

    // 3. Créer le Material Shader
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture }
      },
      vertexShader: particlesVertexShader,
      fragmentShader: particlesFragmentShader,
      transparent: true,
      depthWrite: false, // Important pour éviter les problèmes de tri (z-fighting partiel)
      depthTest: true,
      blending: THREE.NormalBlending
    });
    materialRef.current = mat;

    // 4. Créer l'objet Points et l'ajouter à la scène
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; // Toujours rendre pour éviter les bugs si la bounding box n'est pas mise à jour
    points.name = "DirtParticlesPoints";
    scene.add(points);
    pointsRef.current = points;

    return () => {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
    };
  }, [scene, texture]);

  // Spawner optimisé
  const spawnBurst = (worldPosition, runDirection) => {
    if (!geometryRef.current) return;

    // Calculer le sol une fois pour le burst
    const groundY = calculateHeight(worldPosition.x, worldPosition.z, 0.1, 1);

    // Direction
    const spawnDir = new THREE.Vector3(runDirection.x, 0, runDirection.z);
    if (spawnDir.lengthSq() < 0.01) spawnDir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    spawnDir.normalize();

    let spawnedCount = 0;
    const burstSize = 8; // Nombre de particules par pas

    // Trouver des slots inactifs
    for (let i = 0; i < MAX_PARTICLES && spawnedCount < burstSize; i++) {
      const p = particlesData.current[i];
      if (p.active) continue;

      // Activer la particule
      p.active = true;
      p.life = 0;
      p.maxLife = 0.5 + Math.random() * 0.4;
      p.groundY = groundY;

      // Velocity
      const speed = 0.5 + Math.random() * 1.5; // Vers l'arrière et le haut
      // Boost vertical
      const up = 1.5 + Math.random() * 1.0;
      const spread = (Math.random() - 0.5) * 1.5;

      // Vitesse: derrière + spread
      p.velocity.set(
        -spawnDir.x * speed + spawnDir.z * spread,
        up,
        -spawnDir.z * speed - spawnDir.x * spread
      );

      // Position initiale dans le buffer
      const attrPos = geometryRef.current.attributes.position.array;
      attrPos[i * 3] = worldPosition.x + (Math.random() - 0.5) * 0.3;
      attrPos[i * 3 + 1] = groundY + 0.1;
      attrPos[i * 3 + 2] = worldPosition.z + (Math.random() - 0.5) * 0.3;

      // Taille initiale
      const attrSize = geometryRef.current.attributes.size.array;
      attrSize[i] = 1.0 + Math.random() * 2.0; // Taille visible

      // Opacité initiale
      const attrOpacity = geometryRef.current.attributes.opacity.array;
      attrOpacity[i] = 0.6 + Math.random() * 0.4;

      spawnedCount++;
    }
  };

  useFrame((state, delta) => {
    if (!geometryRef.current || !pointsRef.current) return;

    const dt = Math.min(delta, 0.1);
    const positions = geometryRef.current.attributes.position.array;
    const sizes = geometryRef.current.attributes.size.array;
    const opacities = geometryRef.current.attributes.opacity.array;

    let needsUpdate = false;

    // 1. Simulation Loop (Pure Math)
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particlesData.current[i];
      if (!p.active) continue;

      needsUpdate = true;

      // Age
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        opacities[i] = 0;
        positions[i * 3 + 1] = -1000; // Cacher sous le sol
        continue;
      }

      // Physique
      p.velocity.y -= 6.0 * dt; // Gravité plus forte pour retomber vite
      p.velocity.x *= 0.92; // Friction air plus forte
      p.velocity.z *= 0.92;

      // Update Position State
      const idx = i * 3;
      positions[idx] += p.velocity.x * dt;
      positions[idx + 1] += p.velocity.y * dt;
      positions[idx + 2] += p.velocity.z * dt;

      // Sol collision simple
      if (positions[idx + 1] < p.groundY) {
        positions[idx + 1] = p.groundY + 0.05;
        p.velocity.y = 0;
        // Could add bounce here but dirt usually doesn't bounce much
      }

      // Update Visuals
      const lifeRatio = p.life / p.maxLife;
      opacities[i] = (1.0 - lifeRatio) * 0.8; // Fade out
      sizes[i] += dt * 4.0; // Grandir plus vite
    }

    // 2. Commit updates to GPU only if needed
    if (needsUpdate) {
      geometryRef.current.attributes.position.needsUpdate = true;
      geometryRef.current.attributes.size.needsUpdate = true;
      geometryRef.current.attributes.opacity.needsUpdate = true;
    }

    // 3. Spawning Logic
    if (locomotion === 'run' && targetRef?.current && paths) {
      const time = state.clock.elapsedTime;
      if (time - lastSpawnTimeRef.current > RUN_STEP_INTERVAL_SECONDS) {
        // Position joueur
        const playerWorldPos = new THREE.Vector3();
        targetRef.current.getWorldPosition(playerWorldPos);

        // Path Check Optimisé
        let onPath = false;
        // Check rapide
        for (let i = 0; i < pathObjects.length; i++) {
          if (pathObjects[i].isOnPath(playerWorldPos.x, playerWorldPos.z, 0.4)) {
            onPath = true;
            break;
          }
        }

        if (onPath) {
          lastSpawnTimeRef.current = time;
          spawnBurst(playerWorldPos, movementDirection || new THREE.Vector3(0, 0, 1));
        }
      }
    }
  });

  return null;
}
