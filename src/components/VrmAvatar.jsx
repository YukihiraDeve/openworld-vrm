import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { mixamoVRMRigMap } from '../utils/const'; 
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import FootstepAudio from './audio/FootstepAudio';
import useEyeBlink from '../hooks/useEyeBlink';
import useVRMExpressions from '../hooks/useVRMExpressions';
import DirtRunParticles from './particles/DirtRunParticles';

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
  currentEmote = null, // Émote en cours
  currentEmoteType = null, // Type d'émote ('animation' ou 'expression')
  emoteAnimationUrl = null, // URL de l'animation d'émote
  emoteExpression = null, // Expression faciale à afficher
  paths = null,
  silentLoading = false, // Ne pas émettre d'événements globaux de chargement
}) {
  const groupRef = useRef(); // Référence au groupe contenant le modèle visuel
  const vrmRef = useRef(); // Référence à l'instance VRM chargée
  const rigidBodyRef = useRef(); // Référence au RigidBody (seulement si capsuleCollider=true)
  const [mixer, setMixer] = useState(null);
  const actionsRef = useRef({}); 
  const currentActionRef = useRef(null); 
  const [modelLoaded, setModelLoaded] = useState(false); // Pour le callback onLoad

  // Optimisation Mobile: Si c'est un joueur distant (pas de collider), on désactive les ombres
  // et on simplifie le rendu
  const isRemote = !capsuleCollider;
  // Détection mobile simple
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // Ref pour stocker les dernières valeurs de props pour useFrame
  const latestPropsRef = useRef({ position, rotation });

  // Effet pour mettre à jour le ref quand les props changent
  useEffect(() => {
    latestPropsRef.current = { position, rotation };
  }, [position, rotation]);

  // Système de clignement d'yeux automatique toutes les 5 secondes
  const { triggerEyeBlink, isBlinking } = useEyeBlink(vrmRef, 5000, 150, 2000);
  
  // Système d'expressions faciales VRM
  const { triggerExpression, getCurrentExpression, stopExpression } = useVRMExpressions(vrmRef);

  // Fonction pour charger les animations
  const loadAnimations = async (loadedVrmInstance, animMixer) => {
    try {
      // Charger les trois animations de base
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

      // Charger l'animation d'émote si fournie
      if (emoteAnimationUrl) {
        const emoteClip = await loadMixamoAnimation(emoteAnimationUrl, loadedVrmInstance, 'emote');
        if (emoteClip) {
          actionsRef.current.emote = animMixer.clipAction(emoteClip);
          actionsRef.current.emote.weight = 0;
          actionsRef.current.emote.setLoop(THREE.LoopOnce); // Les émotes ne bouclent pas
          actionsRef.current.emote.clampWhenFinished = true; // Garder la dernière frame
          actionsRef.current.emote.play();
        } else {
          console.error('Le clip Emote na pas pu être chargé ou converti.');
        }
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
        window.dispatchEvent(new CustomEvent('vrm-loading-success'));
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
          // Optimisation: Pas d'ombres pour les joueurs distants sur mobile
          const shadowsEnabled = !(isRemote && isMobile);
          object.castShadow = shadowsEnabled;
          object.receiveShadow = shadowsEnabled;
          object.frustumCulled = true; // Réactiver le frustum culling pour les perfs

          // Optimisation Texture: Réduire la qualité si mobile + distant
          if (isRemote && isMobile && object.material && object.material.map) {
               object.material.map.minFilter = THREE.LinearFilter;
               object.material.map.generateMipmaps = false; 
          }
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
        if (!silentLoading) window.dispatchEvent(new CustomEvent('vrm-loading-success'));
      }
      } catch (error) {
        console.error("Erreur de chargement VRM:", error);
        if (!silentLoading) window.dispatchEvent(new CustomEvent('vrm-loading-error', { detail: { error: error.message } }));
      }
    };

    if (vrmUrl) { // Ne charger que si vrmUrl est fourni
        if (!silentLoading) window.dispatchEvent(new CustomEvent('vrm-loading-start'));
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

  // Effet pour charger/recharger l'animation d'émote
  useEffect(() => {
    if (!mixer || !vrmRef.current || !emoteAnimationUrl) return;

    const loadEmoteAnimation = async () => {
      try {
        // Supprimer l'ancienne animation d'émote si elle existe
        if (actionsRef.current.emote) {
          actionsRef.current.emote.stop();
          mixer.uncacheAction(actionsRef.current.emote.getClip());
          delete actionsRef.current.emote;
        }

        // Charger la nouvelle animation d'émote
        const emoteClip = await loadMixamoAnimation(emoteAnimationUrl, vrmRef.current, 'emote');
        if (emoteClip) {
          actionsRef.current.emote = mixer.clipAction(emoteClip);
          actionsRef.current.emote.weight = 0;
          actionsRef.current.emote.setLoop(THREE.LoopOnce);
          actionsRef.current.emote.clampWhenFinished = true;
          actionsRef.current.emote.play();
        }
      } catch (error) {
        console.error("Erreur lors du chargement de l'animation d'émote:", error);
      }
    };

    loadEmoteAnimation();
  }, [emoteAnimationUrl, mixer]);

  // Effet pour gérer les expressions faciales
  useEffect(() => {
    if (!vrmRef.current) return;

    if (emoteExpression && currentEmoteType === 'expression') {
      // Déclencher l'expression faciale
      triggerExpression(emoteExpression, 1.0, 3000);
    } else if (!emoteExpression && currentEmoteType !== 'animation') {
      // Arrêter l'expression si pas d'émote d'expression active
      stopExpression();
    }
  }, [emoteExpression, currentEmoteType, triggerExpression, stopExpression]);

  // useFrame pour mettre à jour le mixer ET jouer les sons des joueurs distants
  useFrame((state, delta) => {
    // DIAGNOSTIC GLOBAL - DÉSACTIVÉ POUR PROD
    /*
    if (Math.random() < 0.01) {
         window.dispatchEvent(new CustomEvent('debug-phys', { 
             detail: `Global: Group:${!!groupRef.current} Mixer:${!!mixer} VRM:${!!vrmRef.current}` 
         }));
    }
    */

    if (mixer) {
      mixer.update(delta);
    }
    if (vrmRef.current) {
      vrmRef.current.update(delta);
    }

    // 3. Gérer la position et la rotation
    if (groupRef.current) {
        
        // DEBUG DIAGNOSTIC WAITING
        if (Math.random() < 0.01) { // 1 frame sur 100
             window.dispatchEvent(new CustomEvent('debug-phys', { 
                   detail: `Diag: Caps:${capsuleCollider} RB:${!!rigidBodyRef.current} Dir:${movementDirection?.lengthSq() > 0}` 
             }));
        }

      // Si physique activée (joueur local)
      if (capsuleCollider && rigidBodyRef.current && movementDirection) {
         // Déplacer le RigidBody basé sur l'input
          const speed = locomotion === 'run' ? runSpeed : walkSpeed;
          const currentVelocity = rigidBodyRef.current.linvel();
          
          // DEBUG PHYSIQUE MOBILE
          if (movementDirection.lengthSq() > 0 && Math.random() < 0.05) {
               window.dispatchEvent(new CustomEvent('debug-phys', { 
                   detail: `RB:OK Spd:${speed} Vel:${currentVelocity.y.toFixed(2)}` 
               }));
          }

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
     if (mixer && actionsRef.current) {
        // Priorité aux émotes d'animation : si une émote d'animation est active, elle prend la priorité
        if (currentEmote && currentEmoteType === 'animation' && actionsRef.current.emote) {
          const emoteAction = actionsRef.current.emote;
          const previousAction = currentActionRef.current;

          // Si l'émote n'est pas encore l'action courante, faire la transition
          if (emoteAction !== previousAction) {
            if (previousAction) {
              emoteAction.reset().setEffectiveWeight(1).fadeIn(0.2).play();
              previousAction.fadeOut(0.2);
            } else {
              emoteAction.reset().setEffectiveWeight(1).play();
            }
            currentActionRef.current = emoteAction;
          }
        } 
        // Si émote d'expression active, utiliser la locomotion normale mais garder l'expression
        else if (currentEmote && currentEmoteType === 'expression' && locomotion) {
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
        // Si pas d'émote active, utiliser la locomotion normale
        else if (locomotion) {
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
          {/* Particules de terre en course sur les chemins (joueur local uniquement) */}
          {capsuleCollider && paths && (
            <DirtRunParticles
              targetRef={groupRef}
              locomotion={locomotion}
              movementDirection={movementDirection}
              paths={paths}
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