import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { isPositionOnPath } from '../World/Paths';
import { calculateHeight } from '../World/Ground';

// Intervalle des "pas" en course pour synchroniser approximativement les bursts
const RUN_STEP_INTERVAL_SECONDS = 0.3;

// Taille du pool pour limiter les allocations runtime
const MAX_PARTICLE_COUNT = 60;

export default function DirtRunParticles({ targetRef, locomotion, movementDirection, paths }) {
  const { scene } = useThree();
  const texture = useTexture('/assets/particle/dirt_01.png');

  const particleGroupRef = useRef(null);
  const poolRef = useRef([]);
  const lastSpawnTimeRef = useRef(0);

  // Crée le groupe et le pool au montage
  useEffect(() => {
    const group = new THREE.Group();
    group.name = 'DirtRunParticlesGroup';
    scene.add(group);
    particleGroupRef.current = group;

    // Préparer le pool de sprites
    const pool = [];
    for (let i = 0; i < MAX_PARTICLE_COUNT; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        opacity: 0,
        color: new THREE.Color(0.75, 0.6, 0.45),
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.scale.set(0.6, 0.6, 1);
      group.add(sprite);

      pool.push({
        sprite,
        velocity: new THREE.Vector3(),
        lifeSeconds: 0,
        maxLifeSeconds: 0,
        active: false,
      });
    }
    poolRef.current = pool;

    return () => {
      // Cleanup
      if (particleGroupRef.current) {
        scene.remove(particleGroupRef.current);
      }
      poolRef.current.forEach((p) => {
        if (p.sprite) {
          p.sprite.visible = false;
          if (p.sprite.material) {
            p.sprite.material.dispose();
          }
          if (particleGroupRef.current && p.sprite.parent === particleGroupRef.current) {
            particleGroupRef.current.remove(p.sprite);
          }
        }
      });
      poolRef.current = [];
      particleGroupRef.current = null;
    };
  }, [scene, texture]);

  // Spawner util
  const spawnBurst = (worldPosition, runDirection) => {
    if (!particleGroupRef.current || poolRef.current.length === 0) return;

    // Position au niveau du sol (utilise le même terrain que Ground)
    const groundY = calculateHeight(worldPosition.x, worldPosition.z, 0.1, 1);
    const basePosY = groundY + 0.05;

    // Normaliser la direction de course
    const spawnDir = new THREE.Vector3(runDirection.x, 0, runDirection.z);
    if (spawnDir.lengthSq() === 0) {
      spawnDir.set(Math.random() * 2 - 1, 0, Math.random() * 2 - 1);
    }
    spawnDir.normalize();

    // Nombre de particules par burst
    const count = 10;
    for (let i = 0; i < count; i++) {
      const slot = poolRef.current.find((p) => !p.active);
      if (!slot) break;

      const sprite = slot.sprite;

      // Position initiale avec un léger jitter
      const jitterX = (Math.random() - 0.5) * 0.25;
      const jitterZ = (Math.random() - 0.5) * 0.25;
      sprite.position.set(
        worldPosition.x + jitterX,
        basePosY + Math.random() * 0.06,
        worldPosition.z + jitterZ
      );

      // Vitesse initiale: direction de course + écart latéral + montée légère
      const side = new THREE.Vector3(-spawnDir.z, 0, spawnDir.x).multiplyScalar((Math.random() - 0.5) * 0.6);
      const forward = spawnDir.clone().multiplyScalar(0.8 + Math.random() * 0.9);
      const up = new THREE.Vector3(0, 1, 0).multiplyScalar(0.8 + Math.random() * 0.7);
      slot.velocity.copy(forward.add(side).add(up));

      // Apparence
      sprite.visible = true;
      if (sprite.material) {
        sprite.material.opacity = 0.8;
        sprite.material.rotation = Math.random() * Math.PI * 2;
      }
      const scale = 0.4 + Math.random() * 0.6;
      sprite.scale.set(scale, scale, 1);

      // Vie
      slot.lifeSeconds = 0;
      slot.maxLifeSeconds = 0.7 + Math.random() * 0.35;
      slot.active = true;
    }
  };

  // Update boucle
  useFrame((state, delta) => {
    // Mettre à jour les particules existantes
    for (const p of poolRef.current) {
      if (!p.active) continue;

      // Physique simple
      p.velocity.x *= 0.985;
      p.velocity.z *= 0.985;
      p.velocity.y -= 2.5 * delta; // gravité douce

      p.sprite.position.x += p.velocity.x * delta;
      p.sprite.position.y += p.velocity.y * delta;
      p.sprite.position.z += p.velocity.z * delta;

      // Coller au sol si nécessaire
      const groundY = calculateHeight(p.sprite.position.x, p.sprite.position.z, 0.1, 1) + 0.02;
      if (p.sprite.position.y < groundY) {
        p.sprite.position.y = groundY;
        p.velocity.y *= -0.15; // léger rebond amorti
        p.velocity.x *= 0.9;
        p.velocity.z *= 0.9;
      }

      // Vie et transparence
      p.lifeSeconds += delta;
      const t = Math.min(1, p.lifeSeconds / p.maxLifeSeconds);
      const alpha = (1 - t) * 0.8;
      if (p.sprite.material) {
        p.sprite.material.opacity = alpha;
      }
      // Légère expansion
      const baseScale = Math.max(p.sprite.scale.x, 0.001);
      const newScale = baseScale * (1 + 0.4 * delta);
      p.sprite.scale.set(newScale, newScale, 1);

      if (t >= 1) {
        // Désactiver
        p.active = false;
        p.sprite.visible = false;
        if (p.sprite.material) {
          p.sprite.material.opacity = 0;
        }
      }
    }

    // Spawning condition: courir + être sur un chemin
    if (locomotion !== 'run' || !targetRef?.current || !paths || paths.length === 0) {
      return;
    }

    // Position monde du joueur
    const playerWorldPos = new THREE.Vector3();
    targetRef.current.getWorldPosition(playerWorldPos);

    // Vérifier si le joueur est sur un chemin (utilise X,Z)
    const onPath = isPositionOnPath(playerWorldPos.x, playerWorldPos.z, paths, 0.4);
    if (!onPath) return;

    const elapsed = state.clock.elapsedTime;
    if (elapsed - lastSpawnTimeRef.current >= RUN_STEP_INTERVAL_SECONDS) {
      lastSpawnTimeRef.current = elapsed;
      spawnBurst(playerWorldPos, movementDirection || new THREE.Vector3(0, 0, 0));
    }
  });

  return null;
}


