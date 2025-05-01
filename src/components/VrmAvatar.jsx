import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { mixamoVRMRigMap } from '../utils/const'; 
import { RigidBody, CapsuleCollider } from '@react-three/rapier';

// Cache global pour les modèles déjà chargés
const loadedModels = new Map();

async function loadMixamoAnimation(url, vrm, animationName = 'vrmAnimation') {
  const loader = new FBXLoader();
  console.log(`[${animationName}] Chargement de : ${url}`); // Log URL
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
  movementDirection, 
  walkSpeed = 1.5,     
  runSpeed = 3.5,      
  position = [0, 20, 0],
  scale = 1,
  rotation = null,
  modelDirectionOffset = 0,
  onLoad,
  capsuleCollider = false,
}) {
  const groupRef = useRef(); 
  const vrmRef = useRef(); 
  const rigidBodyRef = useRef();
  const [mixer, setMixer] = useState(null);
  const actionsRef = useRef({}); 
  const currentActionRef = useRef(null); 
  const [modelLoaded, setModelLoaded] = useState(false);

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
      } else if (actionsRef.current.walk) {
        actionsRef.current.walk.weight = 1;
        currentActionRef.current = actionsRef.current.walk;
      } else if (actionsRef.current.run) {
        actionsRef.current.run.weight = 1;
        currentActionRef.current = actionsRef.current.run;
      } else {
        console.error('Aucune animation n\'a pu être initialisée.');
      }
    } catch (error) {
      console.error("Erreur lors du chargement des animations:", error);
    }
  };

  useEffect(() => {
    // Ne pas essayer de charger si le groupe de référence n'est pas disponible
    if (!groupRef.current) return;

    // Vérifier si nous avons déjà le modèle en cache
    if (loadedModels.has(vrmUrl)) {
      console.log(`Utilisation du modèle en cache: ${vrmUrl}`);
      const cachedVrm = loadedModels.get(vrmUrl);
      vrmRef.current = cachedVrm;
      
      // S'assurer que la scène est ajoutée au groupe (si c'est un nouveau groupe)
      if (!groupRef.current.children.includes(cachedVrm.scene)) {
        groupRef.current.add(cachedVrm.scene);
      }
      
      // Créer un nouveau mixer pour les animations
      const animMixer = new THREE.AnimationMixer(cachedVrm.scene);
      setMixer(animMixer);
      
      // Charger les animations pour ce modèle
      loadAnimations(cachedVrm, animMixer);
      
      // Informer que le chargement est terminé
      if (onLoad && !modelLoaded) {
        groupRef.current.rigidBodyRef = rigidBodyRef;
        onLoad(groupRef.current);
        setModelLoaded(true);
      }
      
      return;
    }

    // Préparer un nouveau chargement
    console.log(`Chargement d'un nouveau modèle: ${vrmUrl}`);
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let loadedVrmInstance;

    loader.load(vrmUrl, async (gltf) => {
      // Vérifier si le composant est toujours monté
      if (!groupRef.current) {
        console.log("Abandon du chargement - composant démonté");
        return;
      }

      // Traiter le modèle VRM
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      loadedVrmInstance = gltf.userData.vrm;
      vrmRef.current = loadedVrmInstance;

      // Configurer le modèle
      loadedVrmInstance.scene.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
        }
      });

      // Ajouter à la scène
      groupRef.current.add(loadedVrmInstance.scene);
      
      // Mettre en cache pour une utilisation future
      loadedModels.set(vrmUrl, loadedVrmInstance);
      
      // Créer mixer et animations
      const animMixer = new THREE.AnimationMixer(loadedVrmInstance.scene);
      setMixer(animMixer);
      
      // Charger les animations
      await loadAnimations(loadedVrmInstance, animMixer);
      
      // Callback après chargement
      if (onLoad && !modelLoaded) {
        groupRef.current.rigidBodyRef = rigidBodyRef;
        onLoad(groupRef.current);
        setModelLoaded(true);
      }
    }, 
    // Progression de chargement
    (progress) => {
      // Optionnel: gérer la progression
    }, 
    // Gestion des erreurs
    (error) => {
      console.error("Erreur de chargement VRM:", error);
    });

    // Cleanup lors du démontage
    return () => {
      // Nettoyage seulement si nécessaire, les modèles sont maintenant en cache
      if (mixer) {
        mixer.stopAllAction();
      }
    };
  }, [vrmUrl]); // Dépendances réduites pour éviter les rechargements inutiles

  useFrame((state, delta) => {
    // Mise à jour des animations
    if (mixer) {
      mixer.update(delta);
    }
    
    // Mise à jour du VRM
    if (vrmRef.current) {
      vrmRef.current.update(delta);
    }
    
    // Gestion des transitions d'animation
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

    // Si le modèle est chargé et que nous avons groupRef, on peut l'utiliser pour les mouvements
    if (groupRef.current && vrmRef.current && rigidBodyRef.current) {
      // Détection et déblocage du personnage
      const velocity = rigidBodyRef.current.linvel();
      const position = rigidBodyRef.current.translation();
      const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
      
      // Système anti-blocage: si le personnage essaie de bouger mais reste pratiquement immobile
      const isMovingInput = movementDirection && (movementDirection.x !== 0 || movementDirection.z !== 0);
      const isStuck = isMovingInput && horizontalSpeed < 0.1 && Math.abs(velocity.y) < 0.1;
      
      // Compteur de temps bloqué
      if (isStuck) {
        if (!rigidBodyRef.current.stuckTime) {
          rigidBodyRef.current.stuckTime = 0;
        }
        rigidBodyRef.current.stuckTime += delta;
        
        // Si bloqué pendant plus de 0.5 secondes, appliquer une force de déblocage
        if (rigidBodyRef.current.stuckTime > 0.5) {
          // Petit boost vertical pour décoller du sol
          rigidBodyRef.current.applyImpulse({
            x: 0,
            y: 1.0, // Augmenté pour mieux se dégager du sol
            z: 0
          });
          
          // Force plus importante dans la direction du mouvement
          rigidBodyRef.current.applyImpulse({
            x: movementDirection.x * 5,
            y: 0,
            z: movementDirection.z * 5
          });
          
          // Réinitialiser le compteur de blocage
          rigidBodyRef.current.stuckTime = 0;
        }
      } else {
        // Réinitialiser le compteur s'il n'est pas bloqué
        rigidBodyRef.current.stuckTime = 0;
      }

      // Initialiser les références de direction si nécessaire
      if (!rigidBodyRef.current.lastInputDirection) {
        rigidBodyRef.current.lastInputDirection = new THREE.Vector3(0, 0, 0);
        rigidBodyRef.current.currentInputDirection = new THREE.Vector3(0, 0, 0);
        rigidBodyRef.current.lastMoveTime = 0;
        rigidBodyRef.current.changeDirectionCooldown = false;
      }

      // Nouvelle gestion du mouvement améliorée
      if (isMovingInput) {
        // S'assurer que le RigidBody est actif
        if (rigidBodyRef.current.isSleeping) {
          rigidBodyRef.current.wakeUp();
        }
        
        // Stocker la direction d'entrée actuelle
        rigidBodyRef.current.currentInputDirection.set(
          movementDirection.x, 
          0, 
          movementDirection.z
        ).normalize();
        
        // Détecter un changement significatif de direction d'entrée
        const currentInput = rigidBodyRef.current.currentInputDirection;
        const lastInput = rigidBodyRef.current.lastInputDirection;
        const inputDotProduct = currentInput.dot(lastInput);
        
        // N'appliquer le freinage que pour les changements de direction importants (>90°)
        // Angle proche de 90° ou plus (dot product proche de 0 ou négatif)
        const isSignificantChange = inputDotProduct < 0.1 && lastInput.lengthSq() > 0.5;
        
        // Changement mineur de direction (léger ajustement)
        const isMinorChange = inputDotProduct < 0.9 && inputDotProduct >= 0.1 && lastInput.lengthSq() > 0.5;
        
        // Si la direction d'entrée a changé significativement, ralentir mais pas complètement
        if (isSignificantChange && !rigidBodyRef.current.changeDirectionCooldown) {
          // Freinage partiel pour les changements importants (virage à 90° ou plus)
          rigidBodyRef.current.setLinvel({
            x: velocity.x * 0.3,
            y: velocity.y,
            z: velocity.z * 0.3
          });
          
          // Cooldown court pour les changements importants
          rigidBodyRef.current.changeDirectionCooldown = true;
          rigidBodyRef.current.lastMoveTime = state.clock.elapsedTime;
          
          // Mettre à jour la direction stockée
          rigidBodyRef.current.lastInputDirection.copy(currentInput);
          
          // Désactiver le cooldown après un très court délai
          setTimeout(() => {
            if (rigidBodyRef.current) {
              rigidBodyRef.current.changeDirectionCooldown = false;
            }
          }, 70); // Délai réduit de moitié pour plus de fluidité
        } 
        // Pour les changements mineurs, ajustement léger sans cooldown
        else if (isMinorChange && !rigidBodyRef.current.changeDirectionCooldown) {
          // Léger freinage pour les ajustements de direction
          rigidBodyRef.current.setLinvel({
            x: velocity.x * 0.8,
            y: velocity.y,
            z: velocity.z * 0.8
          });
          
          // Mettre à jour la direction sans cooldown
          rigidBodyRef.current.lastInputDirection.copy(currentInput);
        }
        else if (!rigidBodyRef.current.changeDirectionCooldown) {
          // Pour les mouvements continus, juste mettre à jour la direction
          rigidBodyRef.current.lastInputDirection.copy(currentInput);
        }
        
        // Appliquer les forces seulement si on n'est pas en cooldown ou avec une force réduite pendant le cooldown
        // Calcul de la vitesse cible basée sur le type de locomotion
        const targetSpeed = locomotion === 'run' ? runSpeed : (locomotion === 'walk' ? walkSpeed : 0);
        
        // Force de base pour le mouvement
        const baseForce = locomotion === 'run' ? 0.8 : 0.5;
        
        // Transition progressive entre l'arrêt et le mouvement
        const timeSinceDirectionChange = state.clock.elapsedTime - rigidBodyRef.current.lastMoveTime;
        
        // Facteur d'accélération plus rapide pour plus de réactivité
        let accelerationFactor = 1.0;
        if (rigidBodyRef.current.changeDirectionCooldown) {
          // Force réduite pendant le cooldown mais pas nulle pour maintenir un mouvement plus fluide
          accelerationFactor = Math.min(timeSinceDirectionChange * 5, 0.4);
        }
        
        // N'appliquer la force que si on n'a pas dépassé la vitesse cible
        if (horizontalSpeed < targetSpeed) {
          // Force proportionnelle à la différence de vitesse
          const speedRatio = Math.min(horizontalSpeed / targetSpeed, 0.9);
          const adjustedForce = baseForce * (1 - speedRatio * 0.8) * accelerationFactor; // Moins de réduction basée sur la vitesse
          
          rigidBodyRef.current.applyImpulse({
            x: movementDirection.x * adjustedForce,
            y: 0,
            z: movementDirection.z * adjustedForce
          });
        }
        
        // Rotation progressive vers la direction du mouvement (toujours active)
        const targetRotation = Math.atan2(movementDirection.x, movementDirection.z) + modelDirectionOffset;
        const currentRotation = groupRef.current.rotation.y;
        const rotationDiff = targetRotation - currentRotation;
        
        // Normaliser l'angle entre -PI et PI
        const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
        
        // Rotation plus rapide pour un contrôle plus réactif
        groupRef.current.rotation.y += normalizedDiff * 0.2;
      } else if (rigidBodyRef.current && locomotion === 'idle') {
        // Quand on ne bouge pas, freinage progressif
        if (Math.abs(velocity.x) > 0.05 || Math.abs(velocity.z) > 0.05) {
          rigidBodyRef.current.setLinvel({
            x: velocity.x * 0.8,
            y: velocity.y,
            z: velocity.z * 0.8
          });
        } else if (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.z) > 0.01) {
          // Réduction très douce à vitesse faible
          rigidBodyRef.current.setLinvel({
            x: velocity.x * 0.9,
            y: velocity.y,
            z: velocity.z * 0.9
          });
        }
        
        // Réinitialiser l'état du mouvement
        rigidBodyRef.current.lastInputDirection.set(0, 0, 0);
        rigidBodyRef.current.changeDirectionCooldown = false;
        
        // Petite force pour maintenir le RigidBody actif
        if (horizontalSpeed < 0.001) {
          rigidBodyRef.current.applyImpulse({
            x: 0.000001 * (Math.random() - 0.5),
            y: 0,
            z: 0.000001 * (Math.random() - 0.5)
          });
        }
      }
    }
  });

  // Effet pour empêcher le sommeil du RigidBody
  useEffect(() => {
    // Fonction pour s'assurer que le RigidBody reste actif
    const interval = setInterval(() => {
      if (rigidBodyRef.current) {
        // Vérifier si le RigidBody est en sommeil ou semble bloqué
        const velocity = rigidBodyRef.current.linvel();
        const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        
        // Si le RigidBody est en sommeil ou immobile, appliquer une impulsion minuscule
        if (rigidBodyRef.current.isSleeping || horizontalSpeed < 0.0001) {
          rigidBodyRef.current.wakeUp?.();
          
          // Impulsion extrêmement faible pour maintenir le RigidBody actif
          rigidBodyRef.current.applyImpulse({
            x: 0.00001 * (Math.random() - 0.5),
            y: 0.00001,
            z: 0.00001 * (Math.random() - 0.5)
          });
        }
      }
    }, 500); // Vérifier toutes les 500ms
    
    return () => clearInterval(interval);
  }, []);

  // Rendu conditionnel avec RigidBody si capsuleCollider est activé
  return (
    <RigidBody 
      ref={rigidBodyRef}
      position={position}
      mass={1.0}
      type="dynamic"
      lockRotations
      linearDamping={0.8}
      angularDamping={0.95}
      colliders={false}
      friction={0.2}
      restitution={0.0}
      enabledRotations={[false, true, false]}
      gravityScale={1.2}
      ccd={true}
      canSleep={false}  // Désactiver le mode sleep pour éviter le blocage
    >
      <group 
        ref={groupRef} 
        scale={scale}
        rotation={rotation ? [rotation[0], rotation[1], rotation[2]] : [0, 0, 0]}
      >
        {capsuleCollider && (
          <>
            {/* Collider physique invisible */}
            <CapsuleCollider 
              args={[0.9, 0.20]}
              position={[0, 1.1, 0]}
              friction={0.05}
              type="dynamic"
            />

          </>
        )}
      </group>
    </RigidBody>
  );
}