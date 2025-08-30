import { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { calculateHeight } from './Ground';
import { isPositionOnPath, getPathTransitionFactor } from './Paths';

// Pool d'objets pour éviter les allocations
const tempVector3 = new THREE.Vector3();
const tempMatrix4 = new THREE.Matrix4();

// Helper: crée une texture 1D pour les bandes de toon-shading (4 niveaux par défaut)
function createToonGradientTexture(steps = 4) {
  const width = steps;
  const height = 1;
  const size = width * height * 4; // RGBA
  const data = new Uint8Array(size);

  for (let i = 0; i < width; i++) {
    const v = Math.round((i / (width - 1)) * 255);
    const offset = i * 4;
    data[offset + 0] = v;
    data[offset + 1] = v;
    data[offset + 2] = v;
    data[offset + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Composant GrassGPT4 : herbe animée avec InstancedMesh pour meilleures performances
export default function GrassGPT4({
  maxDensity = 10000,  // Densité maximale (près du joueur)
  width = 50,
  height = 50,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
  playerPositionRef, // Ref vers la position du joueur
  paths = [], // Nouveau prop pour les chemins
  pathMargin = 0.3, // Marge autour des chemins où l'herbe ne pousse pas
  lodLevels = [
    { distance: 0, density: 1.0 },    // Distance 0-10: densité 100%
    { distance: 10, density: 1.0 },   // Distance 10: toujours 100%
    { distance: 15, density: 0.9 },   // Distance 15: densité 90%
    { distance: 20, density: 0.8 },   // Distance 20: densité 80%
    { distance: 25, density: 0.7 },   // Distance 25: densité 70%
    { distance: 30, density: 0.6 },   // Distance 30: densité 60%
    { distance: 35, density: 0.5 },   // Distance 35: densité 50%
    { distance: 40, density: 0.4 },   // Distance 40: densité 40%
    { distance: 45, density: 0.3 },   // Distance 45: densité 30%
    { distance: 50, density: 0.2 },   // Distance 50: densité 20%
    { distance: 55, density: 0.1 }    // Distance 55+: densité 10%
  ]
}) {
  const instancedMeshRef = useRef();
  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const { camera } = useThree();
  
  // État optimisé pour le LOD
  const [visibleInstanceCount, setVisibleInstanceCount] = useState(maxDensity);
  const lastPlayerPosition = useRef(new THREE.Vector3());
  const grassInstanceData = useRef([]); // Stocker les données de chaque instance d'herbe
  const lastUpdateTime = useRef(0);
  const updateQueue = useRef([]);
  const batchSize = useRef(100); // Traiter 100 instances par frame max
  
  // Cache pour les calculs de distance
  const distanceCache = useRef(new Map());
  const cacheInvalidationThreshold = 5.0; // Distance pour invalider le cache
  
  // Chargement des textures
  const grassTexture = useTexture('/assets/textures/grass.jpg');
  const noiseTexture = useTexture('/assets/textures/grass_density2.png');

  // Uniforme temps pour animer le vent
  const timeUniform = useMemo(() => ({ value: 0 }), []);

  // Gradient map toon pour le style Ghibli
  const gradientMap = useMemo(() => createToonGradientTexture(4), []);

  useEffect(() => {
    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
    noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
    
    // S'assurer que les textures ont des dimensions de puissance de 2
    grassTexture.minFilter = THREE.LinearMipMapLinearFilter;
    grassTexture.magFilter = THREE.LinearFilter;
    noiseTexture.minFilter = THREE.LinearMipMapLinearFilter;
    noiseTexture.magFilter = THREE.LinearFilter;
  }, [grassTexture, noiseTexture]);

  // Création de la géométrie d'un brin d'herbe (simplifiée pour les performances)
  const bladeGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];

    // Géométrie simplifiée à 6 points au lieu de 10
    const bladesWidth = 0.025;
    const bladesHeight = 0.2;
    
    // Base
    positions.push(-bladesWidth / 2, 0, 0);           // Point 0: bas gauche
    positions.push(bladesWidth / 2, 0, 0);            // Point 1: bas droit
    
    // Milieu
    const middleWidth = bladesWidth * 0.7;
    positions.push(-middleWidth / 2, bladesHeight * 0.6, 0.01);  // Point 2
    positions.push(middleWidth / 2, bladesHeight * 0.6, 0.01);   // Point 3
    
    // Pointe
    const tipWidth = bladesWidth * 0.1;
    positions.push(-tipWidth / 2, bladesHeight, 0);  // Point 4
    positions.push(tipWidth / 2, bladesHeight, 0);   // Point 5
    
    // Normales simplifiées
    for (let i = 0; i < 6; i++) {
      normals.push(0, 1, 0.1);
    }
    
    // UVs simplifiés
    uvs.push(0, 0, 1, 0, 0.1, 0.6, 0.9, 0.6, 0.45, 1, 0.55, 1);
    
    // Couleurs pour le dégradé
    colors.push(0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0);
    
    // Triangles simplifiés
    indices.push(
      0, 2, 1,  // Base gauche
      1, 2, 3,  // Base droit
      2, 4, 3,  // Milieu gauche
      3, 4, 5   // Milieu droit
    );
    
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return geo;
  }, []);

  // Material toon avec bandes (style Ghibli) + animation de vent en vertex
  const material = useMemo(() => {
    const mat = new THREE.MeshToonMaterial({
      color: new THREE.Color('#6ba85e'),
      map: grassTexture,
      alphaMap: noiseTexture,
      transparent: true,
      side: THREE.DoubleSide,
      vertexColors: true,
      alphaTest: 0.1,
      depthWrite: true,
      dithering: true,
      gradientMap: gradientMap,
    });

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'uniform float time;\n' + shader.vertexShader;
      shader.uniforms.time = timeUniform;
      
      // Animation de vent simplifiée
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float windTime = time * 0.8;
         float heightFactor = color.r;
         float windEffect = sin(windTime + position.x * 0.1 + position.z * 0.1) * 0.3;
         transformed.x += windEffect * heightFactor * 0.3;
         transformed.z += windEffect * heightFactor * 0.2;`
      );
    };

    return mat;
  }, [grassTexture, noiseTexture, timeUniform, gradientMap]);

  // Fonction optimisée pour calculer la visibilité
  const calculateInstanceVisibility = (instance, playerPos) => {
    const distanceToPlayer = instance.worldPosition.distanceTo(playerPos);
    instance.distanceToPlayer = distanceToPlayer;
    
    // Recherche optimisée du niveau LOD
    for (let j = 0; j < lodLevels.length; j++) {
      const level = lodLevels[j];
      if (distanceToPlayer <= level.distance) {
        const randomSeed = (instance.index * 0.12345) % 1;
        return randomSeed < level.density;
      }
    }
    
    // Dernier niveau
    if (lodLevels.length > 0) {
      const lastLevel = lodLevels[lodLevels.length - 1];
      const randomSeed = (instance.index * 0.12345) % 1;
      return randomSeed < lastLevel.density;
    }
    
    return false;
  };

  // Initialisation des instances (optimisée)
  useEffect(() => {
    if (!instancedMeshRef.current) return;
    
    const grassCount = Math.floor(maxDensity);
    const mesh = instancedMeshRef.current;
    
    // Réinitialiser les données d'instance
    grassInstanceData.current = [];
    distanceCache.current.clear();
    
    let validInstanceCount = 0;
    const maxAttempts = grassCount * 2; // Réduire les tentatives
    let attempts = 0;
    
    while (validInstanceCount < grassCount && attempts < maxAttempts) {
      const x = (Math.random() - 0.5) * width;
      const z = (Math.random() - 0.5) * height;
      
      attempts++;
      
      // Vérification simplifiée des chemins
      const transitionFactor = paths.length > 0 ? getPathTransitionFactor(x, z, paths, 1.5) : 1;
      if (Math.random() > transitionFactor) continue;
      
      const groundHeight = calculateHeight(x, z, frequency, amplitude);
      
      // Stocker les données avec index pour la stabilité
      grassInstanceData.current[validInstanceCount] = {
        index: validInstanceCount,
        worldPosition: new THREE.Vector3(x + position[0], groundHeight + position[1], z + position[2]),
        distanceToPlayer: 0,
        visible: true,
        transitionFactor: transitionFactor
      };
      
      // Configuration de l'instance
      dummyObj.position.set(x, groundHeight, z);
      dummyObj.rotation.set(0, Math.random() * Math.PI * 2, 0);
      
      const baseScale = 0.8 + Math.random() * 0.4;
      const pathInfluence = Math.pow(transitionFactor, 0.5);
      const scaleMultiplier = 0.7 + 0.3 * pathInfluence;
      
      dummyObj.scale.setScalar(baseScale * scaleMultiplier);
      dummyObj.updateMatrix();
      mesh.setMatrixAt(validInstanceCount, dummyObj.matrix);
      
      validInstanceCount++;
    }
    
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = validInstanceCount;
    
    console.log(`Optimized Grass: Generated ${validInstanceCount} instances`);
    
  }, [maxDensity, width, height, frequency, amplitude, position, dummyObj, paths, pathMargin]);

  // Système de mise à jour progressive ultra-optimisé
  useFrame(({ clock }) => {
    timeUniform.value = clock.getElapsedTime();
    
    if (!playerPositionRef?.current || !instancedMeshRef.current) return;
    
    const playerPosition = playerPositionRef.current;
    const now = performance.now();
    
    // Throttling : mise à jour maximum toutes les 100ms
    if (now - lastUpdateTime.current < 100) return;
    
    // Vérifier si le joueur a bougé significativement (seuil augmenté)
    if (lastPlayerPosition.current.distanceToSquared(playerPosition) < 2.0) return;
    
    lastUpdateTime.current = now;
    
    // Mise à jour progressive par batch
    if (updateQueue.current.length === 0) {
      // Remplir la queue avec les indices à traiter
      for (let i = 0; i < grassInstanceData.current.length; i++) {
        updateQueue.current.push(i);
      }
    }
    
    // Traiter un batch d'instances
    const instancesToProcess = updateQueue.current.splice(0, batchSize.current);
    let visibleInstances = [];
    
    // Récupérer les instances déjà visibles
    for (let i = 0; i < Math.min(visibleInstanceCount, grassInstanceData.current.length); i++) {
      const instance = grassInstanceData.current[i];
      if (instance) {
        visibleInstances.push({ index: i, distance: instance.distanceToPlayer || 0 });
      }
    }
    
    // Traiter le batch actuel
    instancesToProcess.forEach(index => {
      if (index < grassInstanceData.current.length) {
        const instance = grassInstanceData.current[index];
        if (calculateInstanceVisibility(instance, playerPosition)) {
          visibleInstances.push({ index, distance: instance.distanceToPlayer });
        }
      }
    });
    
    // Si on a fini de traiter toutes les instances
    if (updateQueue.current.length === 0) {
      // Trier et limiter
      visibleInstances.sort((a, b) => a.distance - b.distance);
      const targetCount = Math.min(visibleInstances.length, maxDensity);
      
      // Mise à jour douce du count pour éviter les saccades
      const currentCount = instancedMeshRef.current.count;
      const maxChange = Math.max(50, Math.floor(maxDensity * 0.05)); // 5% max change
      
      let newCount = targetCount;
      if (Math.abs(newCount - currentCount) > maxChange) {
        newCount = currentCount + (newCount > currentCount ? maxChange : -maxChange);
      }
      
      // Réorganiser les matrices seulement si nécessaire
      if (newCount !== currentCount) {
        const mesh = instancedMeshRef.current;
        
        for (let i = 0; i < Math.min(newCount, visibleInstances.length); i++) {
          const originalIndex = visibleInstances[i].index;
          mesh.getMatrixAt(originalIndex, tempMatrix4);
          mesh.setMatrixAt(i, tempMatrix4);
        }
        
        mesh.instanceMatrix.needsUpdate = true;
        mesh.count = newCount;
        setVisibleInstanceCount(newCount);
      }
      
      lastPlayerPosition.current.copy(playerPosition);
    }
  });
  
  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[bladeGeometry, material, Math.floor(maxDensity)]}
      position={position}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}
