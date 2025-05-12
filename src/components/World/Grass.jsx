import { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { calculateHeight } from './Ground';

// Composant GrassGPT4 : herbe animée avec InstancedMesh pour meilleures performances
export default function GrassGPT4({
  maxDensity = 10000,  // Densité maximale (près de la caméra)
  width = 50,
  height = 50,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
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
  const dummy = useMemo(() => new THREE.Matrix4(), []);
  const { camera } = useThree();
  
  // État pour suivre la densité actuelle basée sur la distance
  const [currentDensity, setCurrentDensity] = useState(maxDensity);
  const [visibleInstanceCount, setVisibleInstanceCount] = useState(maxDensity);
  const lastPosition = useRef(new THREE.Vector3());
  
  // Chargement des textures
  const grassTexture = useTexture('/assets/textures/grass.jpg');
  const noiseTexture = useTexture('/assets/textures/grass_density2.png');

  // Uniforme temps pour animer le vent
  const timeUniform = useMemo(() => ({ value: 0 }), []);

  useEffect(() => {
    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
    noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
    
    // S'assurer que les textures ont des dimensions de puissance de 2
    grassTexture.minFilter = THREE.LinearMipMapLinearFilter;
    grassTexture.magFilter = THREE.LinearFilter;
    noiseTexture.minFilter = THREE.LinearMipMapLinearFilter;
    noiseTexture.magFilter = THREE.LinearFilter;
  }, [grassTexture, noiseTexture]);

  // Création de la géométrie d'un brin d'herbe
  const bladeGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];

    // Paramètres pour un brin d'herbe plus naturel et fin
    const bladesWidth = 0.025;  // Beaucoup plus fin
    const bladesHeight = 0.2;
    
    // Créer une forme plus homogène avec plusieurs points et une courbe plus naturelle
    // Base - plus large
    positions.push(-bladesWidth / 2, 0, 0);           // Point 0: bas gauche
    positions.push(bladesWidth / 2, 0, 0);            // Point 1: bas droit
    
    // Premier tiers - courbe légère
    const lowerWidth = bladesWidth * 0.9;
    positions.push(-lowerWidth / 2, bladesHeight * 0.2, 0.01);  // Point 2: léger décalage vers l'avant
    positions.push(lowerWidth / 2, bladesHeight * 0.2, 0.01);   // Point 3: léger décalage vers l'avant
    
    // Milieu - courbe plus prononcée
    const middleWidth = bladesWidth * 0.7;
    positions.push(-middleWidth / 2, bladesHeight * 0.5, 0.015);  // Point 4: décalage avant plus prononcé
    positions.push(middleWidth / 2, bladesHeight * 0.5, 0.015);   // Point 5: décalage avant plus prononcé
    
    // Tiers supérieur
    const upperWidth = bladesWidth * 0.3;
    positions.push(-upperWidth / 2, bladesHeight * 0.8, 0.01);  // Point 6: retour vers l'arrière
    positions.push(upperWidth / 2, bladesHeight * 0.8, 0.01);   // Point 7: retour vers l'arrière
    
    // Pointe - très fine
    const tipWidth = bladesWidth * 0.05;
    positions.push(-tipWidth / 2, bladesHeight, 0);  // Point 8: pointe au centre
    positions.push(tipWidth / 2, bladesHeight, 0);   // Point 9: pointe au centre
    
    // Normales calculées pour suivre la courbe
    // Base et section basse - verticales
    for (let i = 0; i < 4; i++) {
      normals.push(0, 1, 0.1);
    }
    
    // Section médiane - légèrement courbée
    for (let i = 0; i < 4; i++) {
      normals.push(0, 0.95, 0.3);
    }
    
    // Section supérieure - courbée vers l'arrière
    for (let i = 0; i < 2; i++) {
      normals.push(0, 0.9, 0.1);
    }
    
    // UVs pour le mapping de texture
    uvs.push(0, 0);      // 0
    uvs.push(1, 0);      // 1
    uvs.push(0.05, 0.2); // 2
    uvs.push(0.95, 0.2); // 3
    uvs.push(0.1, 0.5);  // 4
    uvs.push(0.9, 0.5);  // 5
    uvs.push(0.3, 0.8);  // 6
    uvs.push(0.7, 0.8);  // 7
    uvs.push(0.48, 1);   // 8
    uvs.push(0.52, 1);   // 9
    
    // Couleurs pour le dégradé (base plus foncée, sommet plus clair)
    colors.push(0.2, 0.2, 0.2);    // 0
    colors.push(0.2, 0.2, 0.2);    // 1
    colors.push(0.3, 0.3, 0.3);    // 2
    colors.push(0.3, 0.3, 0.3);    // 3
    colors.push(0.5, 0.5, 0.5);    // 4
    colors.push(0.5, 0.5, 0.5);    // 5
    colors.push(0.8, 0.8, 0.8);    // 6
    colors.push(0.8, 0.8, 0.8);    // 7
    colors.push(1.0, 1.0, 1.0);    // 8
    colors.push(1.0, 1.0, 1.0);    // 9
    
    // Triangles (faces) - division en 4 segments
    indices.push(
      0, 2, 1,  // Segment 1 gauche
      1, 2, 3,  // Segment 1 droit
      2, 4, 3,  // Segment 2 gauche
      3, 4, 5,  // Segment 2 droit
      4, 6, 5,  // Segment 3 gauche
      5, 6, 7,  // Segment 3 droit
      6, 8, 7,  // Segment 4 gauche
      7, 8, 9   // Segment 4 droit
    );
    
    // Face arrière
    indices.push(
      1, 2, 0,  // Segment 1 gauche inversé
      3, 2, 1,  // Segment 1 droit inversé
      3, 4, 2,  // Segment 2 gauche inversé
      5, 4, 3,  // Segment 2 droit inversé
      5, 6, 4,  // Segment 3 gauche inversé
      7, 6, 5,  // Segment 3 droit inversé
      7, 8, 6,  // Segment 4 gauche inversé
      9, 8, 7   // Segment 4 droit inversé
    );
    
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return geo;
  }, []);

  // Material standard avec vent injecté via onBeforeCompile pour supporter ombres
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: grassTexture,
      alphaMap: noiseTexture,
      transparent: true,
      side: THREE.DoubleSide,  // Assurez-vous que c'est bien DoubleSide
      vertexColors: true,
      alphaTest: 0.1,  // Réduit pour éviter la coupure de texture
      depthWrite: true  // Important pour le rendu correct des transparences
    });

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'uniform float time;\n' + shader.vertexShader;
      shader.uniforms.time = timeUniform;
      
      // Ajouter des attributs personnalisés pour l'animation du vent
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        attribute vec3 instanceRandom;
        attribute float instanceHeight;
        
        // Fonctions de bruit pour créer un mouvement plus naturel
        // Simplex noise 2D
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        
        float snoise(vec2 v){
          const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                             -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v -   i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod(i, 289.0);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                           + i.x + vec3(0.0, i1.x, 1.0 ));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                                dot(x12.zw,x12.zw)), 0.0);
          m = m*m;
          m = m*m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }`
      );
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // Créer des valeurs uniques pour chaque instance
         float uniqueTime = time * (0.7 + instanceRandom.x * 0.6);
         float uniquePhase = instanceRandom.y * 6.28; // Phase aléatoire différente pour chaque brin
         
         // Variation de la force du vent basée sur la position
         vec2 windPos = vec2(instanceMatrix[3][0] * 0.1, instanceMatrix[3][2] * 0.1);
         float windVariation = snoise(windPos + vec2(time * 0.3, time * 0.2)) * 0.5 + 0.5;
         
         // Amplitude qui dépend de la hauteur (plus fort en haut)
         float heightFactor = color.r; // Utilisation des couleurs existantes pour l'amplitude
         
         // Combiner plusieurs fréquences pour un mouvement plus naturel
         float windNoise1 = sin(uniqueTime * 0.8 + uniquePhase) * 0.4;
         float windNoise2 = sin(uniqueTime * 1.2 + uniquePhase * 2.0) * 0.2;
         float windNoise3 = snoise(windPos + time * vec2(0.1, 0.12)) * 0.3;
         
         // Mouvements combinés avec des fréquences différentes
         float windEffect = (windNoise1 + windNoise2 + windNoise3) * windVariation;
         
         // Appliquer le mouvement
         float strength = 0.3 * heightFactor;
         transformed.x += windEffect * strength;
         transformed.z += windEffect * strength * 0.7;`
      );
    };

    return mat;
  }, [grassTexture, noiseTexture, timeUniform]);

  // Initialisation des instances
  useEffect(() => {
    if (!instancedMeshRef.current) return;
    
    const grassCount = Math.floor(maxDensity);
    const mesh = instancedMeshRef.current;
    
    // Attributs personnalisés pour l'animation
    const instanceRandoms = new Float32Array(grassCount * 3);
    const instanceHeights = new Float32Array(grassCount);
    
    for (let i = 0; i < grassCount; i++) {
      const x = (Math.random() - 0.5) * width;
      const z = (Math.random() - 0.5) * height;
      
      // Calculer la hauteur du terrain à cette position
      const groundHeight = calculateHeight(x, z, frequency, amplitude);
      
      // Rotation aléatoire autour de l'axe Y
      const angle = Math.random() * Math.PI * 2;
      
      // Légère inclinaison aléatoire
      const tiltAngle = Math.random() * 0.2;
      const tiltDirection = Math.random() * Math.PI * 2;
      
      // Appliquer la transformation
      dummyObj.position.set(x, groundHeight, z);
      
      // Rotation avec une légère inclinaison aléatoire
      dummyObj.rotation.set(
        Math.sin(tiltDirection) * tiltAngle, // Inclinaison X
        angle, // Rotation Y
        Math.cos(tiltDirection) * tiltAngle  // Inclinaison Z
      );
      
      // Échelle plus fine et variable pour chaque brin
      const baseScale = 1.0 + Math.random() * 0.7; // Base plus fine
      const heightVariation = 0.7 + Math.random() * 0.6; // Plus de variation en hauteur
      
      dummyObj.scale.set(
        baseScale, // Largeur
        baseScale * heightVariation, // Hauteur plus variable
        baseScale  // Profondeur
      );
      
      dummyObj.updateMatrix();
      mesh.setMatrixAt(i, dummyObj.matrix);
      
      // Stocker des valeurs vraiment aléatoires pour l'animation du vent
      instanceRandoms[i * 3] = Math.random();     // Variation de vitesse
      instanceRandoms[i * 3 + 1] = Math.random(); // Variation de phase
      instanceRandoms[i * 3 + 2] = Math.random(); // Réserve pour d'autres usages
      instanceHeights[i] = groundHeight;
    }
    
    // Définir les attributs d'instance
    mesh.instanceMatrix.needsUpdate = true;
    
    // Optionnel: ajout d'attributs personnalisés pour l'animation
    mesh.geometry.setAttribute('instanceRandom', new THREE.InstancedBufferAttribute(instanceRandoms, 3));
    mesh.geometry.setAttribute('instanceHeight', new THREE.InstancedBufferAttribute(instanceHeights, 1));
    
  }, [maxDensity, width, height, frequency, amplitude, dummyObj]);

  // Mise à jour de l'uniforme time pour l'animation du vent et LOD
  useFrame(({ clock, camera }) => {
    timeUniform.value = clock.getElapsedTime();
    
    // Ne mettre à jour le LOD que si la caméra a bougé significativement
    // Augmenter le seuil pour éviter des mises à jour trop fréquentes
    if (lastPosition.current.distanceToSquared(camera.position) > 1.0) {
      // Calculer la position centrale de l'herbe dans l'espace monde
      const grassCenter = new THREE.Vector3(...position);
      
      // Calculer la distance entre la caméra et le centre de l'herbe
      const distanceToCamera = camera.position.distanceTo(grassCenter);
      
      // Trouver le niveau de LOD approprié en fonction de la distance
      let densityFactor = lodLevels[0].density; // Par défaut, utiliser la densité max
      
      // Parcourir les niveaux LOD pour trouver le bon facteur
      for (let i = 0; i < lodLevels.length - 1; i++) {
        const currLevel = lodLevels[i];
        const nextLevel = lodLevels[i + 1];
        
        if (distanceToCamera >= currLevel.distance && distanceToCamera < nextLevel.distance) {
          // Interpoler entre les deux niveaux pour une transition douce
          const t = (distanceToCamera - currLevel.distance) / (nextLevel.distance - currLevel.distance);
          densityFactor = THREE.MathUtils.lerp(currLevel.density, nextLevel.density, t);
          break;
        } else if (distanceToCamera >= nextLevel.distance && i === lodLevels.length - 2) {
          // Au-delà du dernier seuil, utiliser la densité minimale
          densityFactor = nextLevel.density;
        }
      }
      
      // Calculer la nouvelle densité d'herbe visible
      const newVisibleCount = Math.floor(maxDensity * densityFactor);
      
      // Mettre à jour uniquement si la densité a changé significativement
      // Augmenter le seuil pour éviter des changements mineurs trop fréquents
      if (Math.abs(newVisibleCount - visibleInstanceCount) > maxDensity * 0.1) {
        // Lisser la transition en limitant la vitesse de changement
        const currentCount = instancedMeshRef.current ? instancedMeshRef.current.count : visibleInstanceCount;
        const maxChange = maxDensity * 0.05; // Limiter le changement à 5% du total par frame
        
        // Calculer le pas pour cette transition
        let stepSize = newVisibleCount - currentCount;
        stepSize = Math.sign(stepSize) * Math.min(Math.abs(stepSize), maxChange);
        
        // Appliquer le changement progressif
        const nextCount = Math.floor(currentCount + stepSize);
        
        setVisibleInstanceCount(nextCount);
        
        // Si nous avons une référence à l'instancedMesh, mettre à jour le nombre d'instances visibles
        if (instancedMeshRef.current) {
          instancedMeshRef.current.count = nextCount;
        }
      }
      
      // Mettre à jour la dernière position connue de la caméra
      lastPosition.current.copy(camera.position);
    }
  });
  
  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[bladeGeometry, material, Math.floor(maxDensity)]}
      position={position}
      castShadow
      receiveShadow
      frustumCulled={false} // Important: empêche la disparition de l'herbe aux bords de l'écran
    />
  );
}
