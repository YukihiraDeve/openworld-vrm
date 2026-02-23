import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { calculateHeight } from './Ground';
import { isPositionOnPath } from './Paths';
import { globalLeafUniforms, FLUFFY_CONFIG, isCanopy, isTrunk } from './FluffyTreeShared';

// Fonction de génération aléatoire déterministe (Mulberry32)
// Permet d'obtenir la même séquence de nombres pour tous les joueurs
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export default function FluffyTrees({
  count = 20,
  width = 100,
  height = 100,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
  paths = [],
  scale = 1.0,
  seed = 42 // Graine par défaut pour la synchronisation multijoueur
}) {
  const { scene } = useGLTF('/assets/models/arbre.glb');
  
  // 1. Préparation des géométries : Fusion de tous les morceaux
  const { canopyGeometry, canopyMaterial, trunkGeometry, trunkMaterial } = useMemo(() => {
    let canopyGeos = [];
    let trunkGeos = [];
    let cMat = null;
    let tMat = null;
    
    // On met à jour les matrices du graphe de scène pour être sûr d'avoir les bonnes transfos
    scene.updateMatrixWorld(true);

    scene.traverse((obj) => {
      if (obj.isMesh) {
        // Clonage de la géométrie
        const geo = obj.geometry.clone();
        
        // Cuisson des transformations
        obj.updateMatrixWorld();
        geo.applyMatrix4(obj.matrix); 

        if (isCanopy(obj.name)) {
            canopyGeos.push(geo);
            if (!cMat) cMat = obj.material;
            // console.log("Feuille trouvée et ajoutée:", obj.name);
        } else if (isTrunk(obj.name)) {
            trunkGeos.push(geo);
            if (!tMat) tMat = obj.material;
        }
      }
    });

    let finalCanopyGeo = null;
    let finalTrunkGeo = null;

    // Fusion des géométries
    if (canopyGeos.length > 0) {
        finalCanopyGeo = mergeGeometries(canopyGeos);
        console.log(`Fusionné ${canopyGeos.length} morceaux de feuilles.`);
    }

    if (trunkGeos.length > 0) {
        finalTrunkGeo = mergeGeometries(trunkGeos);
    }
    
    return { 
      canopyGeometry: finalCanopyGeo, 
      canopyMaterial: cMat, 
      trunkGeometry: finalTrunkGeo, 
      trunkMaterial: tMat 
    };
  }, [scene]);

  // 2. Création du matériau Shader pour les feuilles (Instanced)
  const instancedCanopyMaterial = useMemo(() => {
    if (!canopyMaterial) return null;
    
    const mat = new THREE.MeshLambertMaterial({
      map: canopyMaterial.map,
      // alphaMap: canopyMaterial.map, // Redondant si la texture a déjà un canal alpha, économise de la mémoire
      transparent: false, // Performance : Désactive le blending coûteux. alphaTest suffit pour la découpe.
      side: THREE.DoubleSide,
      alphaTest: 0.5,
      depthWrite: true,
      color: 0xffffff
    });

    mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, globalLeafUniforms);
        
        shader.vertexShader = `
            varying vec3 vWorldPosition;
            uniform float uTime;
            uniform float uWindStrength;
            uniform float uWindFrequency;
            uniform float uWindSpeed;
            
            ${FLUFFY_CONFIG.noiseFunctions}
            ${shader.vertexShader}
        `.replace('#include <begin_vertex>', `
            #include <begin_vertex>
            
            // 1. Calcul précis de la position monde de l'instance
            vec3 instancePos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            vec4 worldPosFull = instanceMatrix * vec4(position, 1.0);
            vec3 vertexWorldPos = worldPosFull.xyz;
            
            // Calcul du temps synchronisé avec l'herbe (uWindSpeed est 0.5 dans la config partagée)
            float time = uTime * uWindSpeed;
            
            // 2. Bruit Global (Vent dominant) - EXACTEMENT comme Grass.jsx
            // Grass: snoise(vec2(instancePos.x * 0.1 + time * 0.5, instancePos.z * 0.1 + time * 0.5))
            // Ici uWindFrequency = 0.1, et time intègre déjà le facteur 0.5 via uWindSpeed
            float noiseVal = snoise(vec2(instancePos.x * uWindFrequency + time, instancePos.z * uWindFrequency + time));
            
            // Normalisation comme l'herbe : (noise * 0.5 + 0.5) => 0 à 1
            float globalWind = (noiseVal * 0.5 + 0.5);
            
            // 3. Turbulence Locale (Frémissement des feuilles) - Haute fréquence
            // On garde cnoise pour la turbulence locale si besoin, mais snoise marche aussi
            // On utilise snoise 2D sur des coords décalées pour varier
            float localTurbulence = snoise(vec2(vertexWorldPos.x * 0.5 + time * 2.0, vertexWorldPos.z * 0.5 + time * 2.0));
            
            // 4. Combinaison
            // L'herbe se plie (rotation), ici on déplace les feuilles (translation)
            // On veut que le déplacement suive l'intensité du vent (globalWind)
            
            vec3 windDirection = vec3(0.0, 0.0, 1.0); // Axe Z pour matcher la rotation X de l'herbe
            
            // Le déplacement dépend de la hauteur
            float heightFactor = pow(max(0.0, position.y) / 10.0, 1.5);
            
            // Déplacement horizontal principal synchronisé
            // On utilise globalWind comme multiplicateur d'intensité
            vec3 displacement = normalize(windDirection) * globalWind * uWindStrength * 3.0 * heightFactor;
            
            // Ajout de la turbulence locale
            displacement += normalize(windDirection) * localTurbulence * 0.1 * heightFactor;
            displacement.y += localTurbulence * 0.1 * heightFactor; // Petit rebond vertical
            
            transformed += displacement;
            
            vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `);

        shader.fragmentShader = `
            varying vec3 vWorldPosition;
            uniform vec3 uLightDirection;
            uniform float uGradientStart; uniform float uGradientEnd;
            uniform vec3 uLitColor; uniform vec3 uShadowColor;
            uniform vec3 uHighlightColor; uniform float uHighlightStart; uniform float uHighlightEnd;
            uniform float uLeafShadowDarkness;
            
            ${shader.fragmentShader}
        `.replace('#include <color_fragment>', `
            #include <color_fragment>
            
            vec3 fromCenterToSurface = normalize(vNormal);
            float lightAlignment = dot(fromCenterToSurface, uLightDirection);
            
            float baseGradientFactor = smoothstep(uGradientStart, uGradientEnd, lightAlignment);
            vec3 baseColor = mix(uShadowColor, uLitColor, baseGradientFactor);
            
            float highlightFactor = smoothstep(uHighlightStart, uHighlightEnd, lightAlignment);
            vec3 gradientColor = mix(baseColor, uHighlightColor, highlightFactor);
            
            #ifdef USE_INSTANCING_COLOR
                gradientColor *= vColor; 
            #endif

            // Meilleure gestion de l'ombre portée sur l'objet lui-même (self-shadowing)
            // On réduit l'impact des ombres portées pour éviter que les feuilles ne s'assombrissent trop entre elles
            float shadow = 1.0;
            #if ( NUM_DIR_LIGHT_SHADOWS > 0 )
                float shadowVal = getShadow(
                    directionalShadowMap[ 0 ],
                    directionalLightShadows[ 0 ].shadowMapSize,
                    directionalLightShadows[ 0 ].shadowBias,
                    directionalLightShadows[ 0 ].shadowRadius,
                    vDirectionalShadowCoord[ 0 ]
                );
                // On remappe l'ombre : au lieu d'aller de 0 à 1, elle va de 0.4 à 1.0
                // Cela signifie que même dans l'ombre portée complète, on garde 40% de la luminosité
                shadow = mix(0.4, 1.0, shadowVal);
            #endif
            
            vec3 finalColor = mix(gradientColor * uLeafShadowDarkness, gradientColor, shadow);
            
            // Boost final de luminosité globale pour compenser la perte de transparence
            finalColor *= 1.2; 
            
            diffuseColor.rgb = finalColor * diffuseColor.rgb;
            
        `).replace('#include <normal_fragment_begin>', `
            #include <normal_fragment_begin>
            vec3 worldUp = vec3(0.0, 1.0, 0.0);
            vec3 viewUp = normalize(mat3(viewMatrix) * worldUp);
            normal = normalize(mix(normal, viewUp, 0.5)); 
        `);
    };
    
    return mat;
  }, [canopyMaterial]);

  const canopyMeshRef = useRef();
  const trunkMeshRef = useRef();
  
  // Génération des arbres (Logique inchangée)
  useEffect(() => {
    if (!canopyMeshRef.current || !trunkMeshRef.current) return;

    // Initialisation du générateur aléatoire avec la graine
    const rng = mulberry32(seed);

    const triesMax = count * 20;
    const minDistance = 4.0;
    const pathMarginLocal = 2.5;
    const maxSlope = 0.35;
    const accepted = [];

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const palette = [
        new THREE.Color('#4caf50'),
        new THREE.Color('#66bb6a'),
        new THREE.Color('#81c784'),
        new THREE.Color('#a5d6a7')
    ];

    const isValidPosition = (x, z) => {
      if (paths && paths.length > 0 && isPositionOnPath(x, z, paths, pathMarginLocal)) return false;
      const h = calculateHeight(x, z, frequency, amplitude);
      const hx = calculateHeight(x + 1.0, z, frequency, amplitude);
      const hz = calculateHeight(x, z + 1.0, frequency, amplitude);
      const slope = Math.max(Math.abs(hx - h), Math.abs(hz - h));
      if (slope > maxSlope) return false;
      
      for (const p of accepted) {
        if ((p.x - x)**2 + (p.z - z)**2 < minDistance**2) return false;
      }
      return true;
    };

    let instanceIdx = 0;
    let attempts = 0;
    
    while (instanceIdx < count && attempts < triesMax) {
      attempts++;
      const x = (rng() - 0.5) * width;
      const z = (rng() - 0.5) * height;
      
      if (!isValidPosition(x, z)) continue;
      
      const y = calculateHeight(x, z, frequency, amplitude);
      
      const s = scale * (0.8 + rng() * 0.7); 
      const r = rng() * Math.PI * 2;
      
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, r, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      
      canopyMeshRef.current.setMatrixAt(instanceIdx, dummy.matrix);
      trunkMeshRef.current.setMatrixAt(instanceIdx, dummy.matrix);
      
      const baseCol = palette[Math.floor(rng() * palette.length)];
      color.copy(baseCol);
      canopyMeshRef.current.setColorAt(instanceIdx, color);
      trunkMeshRef.current.setColorAt(instanceIdx, new THREE.Color(0xffffff));
      
      accepted.push({x, z});
      instanceIdx++;
    }
    
    canopyMeshRef.current.count = instanceIdx;
    trunkMeshRef.current.count = instanceIdx;
    
    canopyMeshRef.current.instanceMatrix.needsUpdate = true;
    canopyMeshRef.current.instanceColor.needsUpdate = true;
    trunkMeshRef.current.instanceMatrix.needsUpdate = true;
    
    console.log(`FluffyTrees: ${instanceIdx} arbres générés.`);
    
  }, [count, width, height, frequency, amplitude, paths, scale, seed]);

  useFrame((state) => {
    globalLeafUniforms.uTime.value = state.clock.elapsedTime;
  });

  if (!canopyGeometry || !trunkGeometry) return null;

  return (
    <group position={position}>
      <instancedMesh
        ref={trunkMeshRef}
        args={[trunkGeometry, trunkMaterial, count]}
        castShadow
        receiveShadow
        frustumCulled={true}
      />
      <instancedMesh
        ref={canopyMeshRef}
        args={[canopyGeometry, instancedCanopyMaterial, count]}
        castShadow
        receiveShadow
        frustumCulled={true}
      />
    </group>
  );
}
