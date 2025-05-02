import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { mixamoVRMRigMap } from '../utils/const'; 
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import FootstepAudio from './audio/FootstepAudio';

// Cache global pour les modèles déjà chargés
const loadedModels = new Map();
const yAxis = new THREE.Vector3(0, 1, 0); // Pré-calculer l'axe Y
const targetQuaternion = new THREE.Quaternion(); // Réutiliser le quaternion cible

async function loadMixamoAnimation(url, vrm, animationName = 'vrmAnimation') {
  const loader = new FBXLoader();
  const asset = await loader.loadAsync(url);
  const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com');


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
  return convertedClip;
}

export default function VrmAvatar({
  vrmUrl,
  idleAnimationUrl, 
  walkAnimationUrl,
  runAnimationUrl,  
  locomotion,       
  movementDirection, // Fourni seulement pour le joueur local
  walkSpeed = 1.5,     
  runSpeed = 3.5,      
  position = [0, 0, 0],
  scale = 1,
  rotation = null,
  modelDirectionOffset = 0,
  onLoad,
  capsuleCollider = false, // true pour le joueur local, false pour les distants
  audioListener, 
  stepSoundBuffers,
}) {
  const groupRef = useRef(); // Référence au groupe contenant le modèle visuel
  const vrmRef = useRef(); // Référence à l'instance VRM chargée
  const rigidBodyRef = useRef(); // Référence au RigidBody (seulement si capsuleCollider=true)
  const [mixer, setMixer] = useState(null);
  const actionsRef = useRef({}); 
  const currentActionRef = useRef(null); 
  const [modelLoaded, setModelLoaded] = useState(false); // Pour le callback onLoad

  // Ref pour stocker les dernières valeurs de props pour useFrame
  const latestPropsRef = useRef({ position, rotation });

  // Effet pour mettre à jour le ref quand les props changent
  useEffect(() => {
    latestPropsRef.current = { position, rotation };
  }, [position, rotation]);

  // Fonction pour charger les animations
  const loadAnimations = async (loadedVrmInstance, animMixer) => {
    try {
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
        console.error('Le clip Idle na pas pu être chargé ou converti.');
      }

      if (walkClip) {
        actionsRef.current.walk = animMixer.clipAction(walkClip);
        actionsRef.current.walk.weight = 0;
        actionsRef.current.walk.play();
      } else {
        console.error('Le clip Walk na pas pu être chargé ou converti.');
      }

      if (runClip) {
        actionsRef.current.run = animMixer.clipAction(runClip);
        actionsRef.current.run.weight = 0;
        actionsRef.current.run.play();
      } else {
        console.error('Le clip Run na pas pu être chargé ou converti.');
      }

      // Initialiser l'action courante si idle existe
      if (actionsRef.current.idle) {
        currentActionRef.current = actionsRef.current.idle; // Définit l'action initiale
      } else if (actionsRef.current.walk) {
        actionsRef.current.walk.weight = 1;
        currentActionRef.current = actionsRef.current.walk;
      } else if (actionsRef.current.run) {
        actionsRef.current.run.weight = 1;
        currentActionRef.current = actionsRef.current.run;
      } else {
        console.error('Aucune animation na pu être initialisée.');
      }
    } catch (error) {
      console.error("Erreur lors du chargement des animations:", error);
    }
  };

  // Effet pour charger le modèle VRM et les animations
  useEffect(() => {
    let vrmSceneAddedToGroup = false; // Indicateur pour savoir si la scène a été ajoutée

    const loadVrm = async () => {
      // Vérifier si le modèle est en cache
    if (loadedModels.has(vrmUrl)) {
    
      const cachedVrm = loadedModels.get(vrmUrl);
      vrmRef.current = cachedVrm;
      
        if (groupRef.current && !groupRef.current.children.includes(cachedVrm.scene)) {
        groupRef.current.add(cachedVrm.scene);
             vrmSceneAddedToGroup = true;
      }
      
      const animMixer = new THREE.AnimationMixer(cachedVrm.scene);
      setMixer(animMixer);
        await loadAnimations(cachedVrm, animMixer);
      
      if (onLoad && !modelLoaded) {
           groupRef.current.rigidBodyRef = capsuleCollider ? rigidBodyRef : null;
        onLoad(groupRef.current);
        setModelLoaded(true);
      }
      return;
    }


    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

      try {
        const gltf = await loader.loadAsync(vrmUrl);
      if (!groupRef.current) {
      
        return;
      }

      VRMUtils.removeUnnecessaryJoints(gltf.scene);
        const loadedVrmInstance = gltf.userData.vrm;
      vrmRef.current = loadedVrmInstance;

      loadedVrmInstance.scene.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
        }
      });

        if (groupRef.current) {
      groupRef.current.add(loadedVrmInstance.scene);
            vrmSceneAddedToGroup = true;
        }
      
        loadedModels.set(vrmUrl, loadedVrmInstance); // Mettre en cache
      
      const animMixer = new THREE.AnimationMixer(loadedVrmInstance.scene);
      setMixer(animMixer);
      await loadAnimations(loadedVrmInstance, animMixer);
      
      if (onLoad && !modelLoaded) {
           groupRef.current.rigidBodyRef = capsuleCollider ? rigidBodyRef : null;
        onLoad(groupRef.current);
        setModelLoaded(true);
      }
      } catch (error) {
      console.error("Erreur de chargement VRM:", error);
      }
    };

    if (vrmUrl) { // Ne charger que si vrmUrl est fourni
        loadVrm();
    }

    // Cleanup lors du démontage
    return () => {
       if (vrmSceneAddedToGroup && groupRef.current && vrmRef.current?.scene) {
         // Essayer de retirer la scène seulement si elle existe toujours dans le groupe
         if (groupRef.current.children.includes(vrmRef.current.scene)) {
             groupRef.current.remove(vrmRef.current.scene);
         }
       }
      if (mixer) {
        mixer.stopAllAction();
        // Optionnel: supprimer les clips et le mixer pour libérer la mémoire si nécessaire
        // Object.values(actionsRef.current).forEach(action => mixer.uncacheAction(action.getClip()));
        // setMixer(null); // Déplacé après la boucle
      }
      setMixer(null); // Assurer la réinitialisation
      // Réinitialiser les refs d'action pour éviter les problèmes au rechargement
      actionsRef.current = {};
      currentActionRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vrmUrl, onLoad, capsuleCollider]); // Dépendances correctes

  // useFrame pour mettre à jour le mixer ET jouer les sons des joueurs distants
  useFrame((state, delta) => {
    if (mixer) {
      mixer.update(delta);
    }
    if (vrmRef.current) {
      vrmRef.current.update(delta);
    }

    // 3. Gérer la position et la rotation
    if (groupRef.current) {
      // Si physique activée (joueur local)
      if (capsuleCollider && rigidBodyRef.current && movementDirection) {
         // Déplacer le RigidBody basé sur l'input
          const speed = locomotion === 'run' ? runSpeed : walkSpeed;
          const currentVelocity = rigidBodyRef.current.linvel();

          rigidBodyRef.current.setLinvel({
            x: movementDirection.x * speed,
            y: currentVelocity.y, // Conserver la vitesse verticale (saut, gravité)
            z: movementDirection.z * speed
          }, true); // auto-wake

          // Arrêter le mouvement horizontal si pas d'input
          if (movementDirection.lengthSq() === 0) {
              rigidBodyRef.current.setLinvel({ x: 0, y: currentVelocity.y, z: 0 }, true);
          }

          // Calculer la rotation du groupe visuel (joueur local)
          if (movementDirection.lengthSq() > 0) {
              const angle = Math.atan2(movementDirection.x, movementDirection.z);
              targetQuaternion.setFromAxisAngle(yAxis, angle + modelDirectionOffset);
               groupRef.current.quaternion.slerp(targetQuaternion, 0.15); // Rotation plus fluide
          }

      }
      // Si physique désactivée (joueur distant)
      else if (!capsuleCollider && groupRef.current) {
         // Lire les dernières props depuis le ref
        const currentPos = latestPropsRef.current.position;
        const currentRot = latestPropsRef.current.rotation;

    

        // Mettre à jour la position directement depuis les valeurs du ref
        if (Array.isArray(currentPos) && currentPos.length === 3) {
          groupRef.current.position.set(currentPos[0], currentPos[1], currentPos[2]);
        }
        // Mettre à jour la rotation directement depuis les valeurs du ref
        if (currentRot) {
          groupRef.current.quaternion.set(currentRot.x, currentRot.y, currentRot.z, currentRot.w);
        }
      }
    }

    // 4. Gérer les transitions d'animation (commun au local et distant)
     if (mixer && actionsRef.current && locomotion) { // Assurez-vous que locomotion existe
        const targetActionObject = actionsRef.current[locomotion];
        const previousActionObject = currentActionRef.current;

        if (targetActionObject && targetActionObject !== previousActionObject) {
            if (previousActionObject) {
                 targetActionObject.reset().setEffectiveWeight(1).fadeIn(0.3).play();
                 previousActionObject.fadeOut(0.3);
            } else {
                 targetActionObject.reset().setEffectiveWeight(1).play();
            }
            currentActionRef.current = targetActionObject;
        } else if (!previousActionObject && targetActionObject) {
             targetActionObject.reset().setEffectiveWeight(1).play();
            currentActionRef.current = targetActionObject;
        }
     }

    // 5. Système anti-blocage (seulement pour le joueur local avec physique)
     if (capsuleCollider && groupRef.current && vrmRef.current && rigidBodyRef.current && movementDirection) {
         const velocity = rigidBodyRef.current.linvel();
         const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
         const isMovingInput = movementDirection.lengthSq() > 0;
         const isStuck = isMovingInput && horizontalSpeed < 0.1 && Math.abs(velocity.y) < 0.1; // Condition de blocage

         const stuckTimeRef = rigidBodyRef.current.userData?.stuckTimeRef || { current: 0 };
         rigidBodyRef.current.userData = { ...rigidBodyRef.current.userData, stuckTimeRef };

         if (isStuck) {
             stuckTimeRef.current += delta;
             if (stuckTimeRef.current > 0.5) {
                
                 rigidBodyRef.current.applyImpulse({ x: 0, y: 1.5, z: 0 }, true); // Boost vertical
                 rigidBodyRef.current.applyImpulse({ x: movementDirection.x * 3, y: 0, z: movementDirection.z * 3 }, true); // Boost directionnel
                 stuckTimeRef.current = 0; // Réinitialiser
             }
         } else {
             stuckTimeRef.current = 0; // Réinitialiser si non bloqué
         }
     }

  });

   // Effet pour prévenir le sommeil du RigidBody (seulement si physique activée)
  useEffect(() => {
      if (!capsuleCollider) return; // Ne rien faire si pas de physique

    const interval = setInterval(() => {
        if (rigidBodyRef.current && rigidBodyRef.current.isSleeping()) {
          
          rigidBodyRef.current.wakeUp();
           rigidBodyRef.current.applyImpulse({ x: 0.0001, y: 0.0001, z: 0.0001 }, true);
        }
      }, 1000); // Vérifier toutes les secondes
    
    return () => clearInterval(interval);
    }, [capsuleCollider]); // Dépend de capsuleCollider


  // Rendu conditionnel
  if (capsuleCollider) {
    // Rendu avec physique pour le joueur local
  return (
    <RigidBody 
      ref={rigidBodyRef}
        position={position} // Position initiale du corps physique
        colliders={false} // Le collider est ajouté manuellement en dessous
        mass={1}
      type="dynamic"
        enabledRotations={[false, true, false]} // Autorise rotation Y
        lockRotations={true} // Verrouille X et Z mais pas Y (implicitement)
        linearDamping={0.8} // Freinage linéaire
        angularDamping={0.8} // Freinage angulaire
        friction={0.5}
        restitution={0.1}
        gravityScale={1.5}
        canSleep={false} // Important pour éviter les problèmes de réveil
        ccd={true} // Continuous Collision Detection
      >
        {/* Le groupe visuel est un enfant du RigidBody */}
        <group ref={groupRef} scale={scale}>
          {/* Le modèle VRM sera ajouté ici par useEffect */}
          {audioListener && stepSoundBuffers && (
            <FootstepAudio 
              audioListener={audioListener}
              stepSoundBuffers={stepSoundBuffers}
              targetRef={groupRef} // Le groupe visuel contient les sons
              locomotion={locomotion}
            />
          )}
        </group>
        {/* Le collider physique est aussi un enfant du RigidBody */}
        <CapsuleCollider
          args={[0.7, 0.3]} // [demi-hauteur partie cylindrique, rayon] - Ajuster
          position={[0, 1.0, 0]} // Position relative au RigidBody - Ajuster Y = demi-hauteur + rayon
        />
      </RigidBody>
    );
  } else {
    // Rendu sans physique pour les joueurs distants
    return (
      <group 
        ref={groupRef} 
        position={position} // Position initiale (sera mise à jour dans useFrame)
        scale={scale}
        // La rotation sera appliquée dans useFrame
      >
        {/* Le modèle VRM sera ajouté ici par useEffect */}
        {audioListener && stepSoundBuffers && (
          <FootstepAudio 
            audioListener={audioListener}
            stepSoundBuffers={stepSoundBuffers}
            targetRef={groupRef} // Le groupe visuel contient les sons
            locomotion={locomotion}
          />
        )}
      </group>
  );
  }
}