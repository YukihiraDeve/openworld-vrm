import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { mixamoVRMRigMap } from '../utils/const'; 


async function loadMixamoAnimation(url, vrm, animationName = 'vrmAnimation') {
  const loader = new FBXLoader();
  console.log(`[${animationName}] Chargement de : ${url}`); // Log URL
  const asset = await loader.loadAsync(url);
  console.log(`[${animationName}] Asset chargé:`, asset); // Log asset
  const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com');
  console.log(`[${animationName}] Clip trouvé:`, clip); 

  if (!clip) {
    console.error(`[${animationName}] Animation "mixamo.com" non trouvée dans ${url}`);
    return null; 
  }

  const tracks = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();
  const _vec3 = new THREE.Vector3();

  const motionHipsHeight = asset.getObjectByName('mixamorigHips')?.position.y;
  const vrmHipsY = vrm.humanoid?.getNormalizedBoneNode('hips')?.getWorldPosition(_vec3).y;
  const vrmRootY = vrm.scene.getWorldPosition(_vec3).y;
  const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

  clip.tracks.forEach((track) => {
    const trackSplitted = track.name.split('.');
    const mixamoRigName = trackSplitted[0];
    const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
    const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
    const mixamoRigNode = asset.getObjectByName(mixamoRigName);

    if (vrmNodeName != null) {
      const propertyName = trackSplitted[1];

      mixamoRigNode?.getWorldQuaternion(restRotationInverse).invert();
      mixamoRigNode?.parent?.getWorldQuaternion(parentRestWorldRotation);

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        for (let i = 0; i < track.values.length; i += 4) {
          const flatQuaternion = track.values.slice(i, i + 4);
          _quatA.fromArray(flatQuaternion);
          _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
          _quatA.toArray(flatQuaternion);
          flatQuaternion.forEach((v, index) => {
            track.values[index + i] = v;
          });
        }

        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            track.times,
            track.values.map((v_1, i_1) => (vrm.meta?.metaVersion === '0' && i_1 % 2 === 0 ? -v_1 : v_1))
          )
        );
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        const value = track.values.map(
          (v_2, i_2) => (vrm.meta?.metaVersion === '0' && i_2 % 3 !== 1 ? -v_2 : v_2) * hipsPositionScale
        );
        tracks.push(new THREE.VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, value));
      }
    }
  });

  const convertedClip = new THREE.AnimationClip(animationName, clip.duration, tracks);
  console.log(`[${animationName}] Pistes converties (${tracks.length}):`, tracks); 
  console.log(`[${animationName}] Clip converti:`, convertedClip); 
  return convertedClip;
}

export default function VrmAvatar({
  vrmUrl,
  idleAnimationUrl, 
  walkAnimationUrl,
  runAnimationUrl,  
  locomotion,       
  movementDirection, 
  walkSpeed = 2,     
  runSpeed = 4,      
  position = [0, 0, 0],
  scale = 1,
  onLoad,
}) {
  const groupRef = useRef(); 
  const vrmRef = useRef(); 
  const [mixer, setMixer] = useState(null);
  const actionsRef = useRef({}); 
  const currentActionRef = useRef(null); 

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let loadedVrmInstance; // Pour stocker l'instance VRM

    loader.load(vrmUrl, async (gltf) => {
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      loadedVrmInstance = gltf.userData.vrm;
      vrmRef.current = loadedVrmInstance; // Stocke la référence

      loadedVrmInstance.scene.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
        }
      });
      groupRef.current.add(loadedVrmInstance.scene);

      if (onLoad) {
        onLoad(groupRef);
      }

      const animMixer = new THREE.AnimationMixer(loadedVrmInstance.scene);
      setMixer(animMixer);

      // Charger les trois animations
      const idleClip = await loadMixamoAnimation(idleAnimationUrl, loadedVrmInstance, 'idle');
      const walkClip = await loadMixamoAnimation(walkAnimationUrl, loadedVrmInstance, 'walk');
      const runClip = await loadMixamoAnimation(runAnimationUrl, loadedVrmInstance, 'run');

      // Vérifier si les clips ont été chargés correctement
      if (idleClip) {
        actionsRef.current.idle = animMixer.clipAction(idleClip);
        actionsRef.current.idle.weight = 1;
        actionsRef.current.idle.play();
      } else {
        console.error('Le clip Idle n\'a pas pu être chargé ou converti.');
      }

      if (walkClip) {
        actionsRef.current.walk = animMixer.clipAction(walkClip);
        actionsRef.current.walk.weight = 0;
        actionsRef.current.walk.play();
      } else {
        console.error('Le clip Walk n\'a pas pu être chargé ou converti.');
      }

      if (runClip) {
        actionsRef.current.run = animMixer.clipAction(runClip);
        actionsRef.current.run.weight = 0;
        actionsRef.current.run.play();
      } else {
        console.error('Le clip Run n\'a pas pu être chargé ou converti.');
      }

      // Initialiser l'action courante si idle existe
      if (actionsRef.current.idle) {
        currentActionRef.current = actionsRef.current.idle; // Définit l'action initiale
      } else {
        // Fallback si idle échoue (tenter walk, puis run)
        if (actionsRef.current.walk) {
          actionsRef.current.walk.weight = 1;
          currentActionRef.current = actionsRef.current.walk;
        } else if (actionsRef.current.run) {
          actionsRef.current.run.weight = 1;
          currentActionRef.current = actionsRef.current.run;
        } else {
          console.error('Aucune animation n\'a pu être initialisée.');
        }
      }

    }, undefined, (error) => {
      console.error("Erreur de chargement VRM:", error);
    });

   
    return () => {
      if (loadedVrmInstance) {
        groupRef.current?.remove(loadedVrmInstance.scene);

      }
      if (mixer) {
     
      }
    };

  }, [vrmUrl, idleAnimationUrl, walkAnimationUrl, runAnimationUrl, onLoad]); // Dépendances du chargement

  useFrame((state, delta) => {
   
    if (vrmRef.current) vrmRef.current.update(delta);
    if (mixer) mixer.update(delta);

    
    const targetActionObject = actionsRef.current[locomotion]; 
    const previousActionObject = currentActionRef.current;

    // Vérifier si une transition est nécessaire et possible
    if (targetActionObject && previousActionObject && targetActionObject !== previousActionObject) {

        targetActionObject.enabled = true;
        targetActionObject.setEffectiveTimeScale(1.0);
        targetActionObject.setEffectiveWeight(1.0);
        targetActionObject.time = 0; 
        targetActionObject.play();

        // Transitionner
        previousActionObject.crossFadeTo(targetActionObject, 0.3, true); 

        currentActionRef.current = targetActionObject;
    }

   
    if (groupRef.current && vrmRef.current && movementDirection && movementDirection.lengthSq() > 0) {
        const avatar = groupRef.current;

     
        const angle = Math.atan2(movementDirection.x, movementDirection.z);
        const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        avatar.quaternion.slerp(targetQuaternion, 0.1); 

        const currentSpeed = locomotion === 'run' ? runSpeed : walkSpeed;
        const moveDistance = currentSpeed * delta;
        const displacement = movementDirection.clone().normalize().multiplyScalar(moveDistance);

      
        avatar.position.add(displacement);


    }
  });

  // Retourne le groupe qui contient le VRM
  return <group ref={groupRef} position={position} scale={scale} dispose={null} />;
}
