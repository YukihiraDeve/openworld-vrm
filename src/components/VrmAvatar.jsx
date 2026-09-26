import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { mixamoVRMRigMap } from '../utils/const';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import FootstepAudio from './audio/FootstepAudio';
import useEyeBlink from '../hooks/useEyeBlink';
import useVRMExpressions from '../hooks/useVRMExpressions';
import DirtRunParticles from './particles/DirtRunParticles';

// FileLoader conserve les données brutes, mais chaque GLTFLoader parse toujours sa
// propre scène. Les avatars ne partagent donc ni squelette, ni managers VRM vivants.
THREE.Cache.enabled = true;

const mixamoSourcePromises = new Map();
const yAxis = new THREE.Vector3(0, 1, 0);
const REMOTE_POSITION_RESPONSE = 14;
const REMOTE_ROTATION_RESPONSE = 16;
const LOCAL_ROTATION_RESPONSE = 9.75;
const MAX_INTERPOLATION_DELTA = 0.1;
const STEP_PROBE_LOW = 0.18;
const STEP_PROBE_HIGH = 0.62;
const STEP_PROBE_LENGTH = 0.65;
const STEP_HOP_VELOCITY = 2.6;
const RESPAWN_HEIGHT = -25;
const RESPAWN_POSITION = { x: 0, y: 2, z: 0 };
const AVATAR_RIM_COLOR = new THREE.Color('#ffe6c4').multiplyScalar(0.2);

// Liseré lumineux discret qui détache l'avatar du décor, sauf si le modèle définit déjà le sien
function applyAvatarRim(material) {
  if (!material?.isMToonMaterial || material.isOutline) return;
  if (material.parametricRimColorFactor.getHex() !== 0) return;
  material.parametricRimColorFactor.copy(AVATAR_RIM_COLOR);
  material.parametricRimFresnelPowerFactor = 3.2;
  material.parametricRimLiftFactor = 0;
  material.rimLightingMixFactor = 1;
}

function loadMixamoSource(url) {
  const cachedPromise = mixamoSourcePromises.get(url);
  if (cachedPromise) return cachedPromise;

  const loader = new FBXLoader();
  let sourcePromise;

  sourcePromise = loader
    .loadAsync(url)
    .then((asset) => {
      asset.updateMatrixWorld(true);

      const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com');
      if (!clip) {
        console.error(`Animation "mixamo.com" non trouvée dans ${url}`);
      }

      return { asset, clip };
    })
    .catch((error) => {
      if (mixamoSourcePromises.get(url) === sourcePromise) {
        mixamoSourcePromises.delete(url);
      }
      throw error;
    });

  mixamoSourcePromises.set(url, sourcePromise);
  return sourcePromise;
}

async function loadMixamoAnimation(
  url,
  vrm,
  animationName = 'vrmAnimation',
  isCancelled = () => false,
) {
  if (!url || !vrm) return null;

  const { asset, clip } = await loadMixamoSource(url);
  if (!clip || isCancelled()) return null;

  vrm.scene.updateMatrixWorld(true);

  const tracks = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const sourceQuaternion = new THREE.Quaternion();
  const worldPosition = new THREE.Vector3();

  const motionHipsHeight = asset.getObjectByName('mixamorigHips')?.position.y;
  const vrmHipsNode = vrm.humanoid?.getNormalizedBoneNode('hips');
  const vrmHipsY = vrmHipsNode
    ? vrmHipsNode.getWorldPosition(worldPosition).y
    : null;
  const vrmRootY = vrm.scene.getWorldPosition(worldPosition).y;
  const vrmHipsHeight = vrmHipsY == null ? null : Math.abs(vrmHipsY - vrmRootY);
  const hipsPositionScale =
    Number.isFinite(motionHipsHeight) &&
    Math.abs(motionHipsHeight) > Number.EPSILON &&
    Number.isFinite(vrmHipsHeight)
      ? vrmHipsHeight / Math.abs(motionHipsHeight)
      : 1;
  const isVrm0 = vrm.meta?.metaVersion === '0';

  for (const track of clip.tracks) {
    if (isCancelled()) return null;

    const [mixamoRigName, propertyName] = track.name.split('.');
    const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
    if (!vrmBoneName || !propertyName) continue;

    const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
    if (!vrmNodeName) continue;

    const mixamoRigNode = asset.getObjectByName(mixamoRigName);
    restRotationInverse.identity();
    parentRestWorldRotation.identity();
    mixamoRigNode?.getWorldQuaternion(restRotationInverse).invert();
    mixamoRigNode?.parent?.getWorldQuaternion(parentRestWorldRotation);

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const values = new track.values.constructor(track.values.length);

      for (let i = 0; i < track.values.length; i += 4) {
        sourceQuaternion.fromArray(track.values, i);
        sourceQuaternion
          .premultiply(parentRestWorldRotation)
          .multiply(restRotationInverse);

        if (isVrm0) {
          sourceQuaternion.x *= -1;
          sourceQuaternion.z *= -1;
        }

        sourceQuaternion.toArray(values, i);
      }

      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times.slice(),
          values,
        ),
      );
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      const values = new track.values.constructor(track.values.length);

      for (let i = 0; i < track.values.length; i += 1) {
        const axis = i % 3;
        const direction = isVrm0 && axis !== 1 ? -1 : 1;
        values[i] = track.values[i] * direction * hipsPositionScale;
      }

      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          track.times.slice(),
          values,
        ),
      );
    }
  }

  return new THREE.AnimationClip(animationName, clip.duration, tracks);
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
  position = [0, 0, 0],
  scale = 1,
  rotation = null,
  modelDirectionOffset = 0,
  onLoad,
  capsuleCollider = false,
  audioListener,
  stepSoundBuffers,
  currentEmote = null,
  currentEmoteType = null,
  emoteAnimationUrl = null,
  emoteExpression = null,
  paths = null,
  silentLoading = false,
}) {
  const groupRef = useRef();
  const vrmRef = useRef();
  const rigidBodyRef = useRef();
  const mixerRef = useRef(null);
  const actionsRef = useRef({});
  const currentActionRef = useRef(null);
  const loadGenerationRef = useRef(0);
  const emoteRequestRef = useRef(0);
  const stuckTimeRef = useRef(0);
  const targetQuaternionRef = useRef(new THREE.Quaternion());
  const nextLinearVelocityRef = useRef({ x: 0, y: 0, z: 0 });
  const remoteTargetPositionRef = useRef(new THREE.Vector3());
  const remoteTargetQuaternionRef = useRef(new THREE.Quaternion());
  const remoteTransformInitializedRef = useRef(false);
  const onLoadRef = useRef(onLoad);
  const silentLoadingRef = useRef(silentLoading);
  const [vrmRevision, setVrmRevision] = useState(0);
  const { world, rapier } = useRapier();
  const stepRay = useMemo(
    () => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
    [rapier],
  );

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    silentLoadingRef.current = silentLoading;
  }, [silentLoading]);

  useEffect(() => {
    if (capsuleCollider) return;

    if (
      Array.isArray(position) &&
      position.length === 3 &&
      position.every(Number.isFinite)
    ) {
      remoteTargetPositionRef.current.fromArray(position);
    }

    if (
      rotation &&
      Number.isFinite(rotation.x) &&
      Number.isFinite(rotation.y) &&
      Number.isFinite(rotation.z) &&
      Number.isFinite(rotation.w)
    ) {
      remoteTargetQuaternionRef.current
        .set(rotation.x, rotation.y, rotation.z, rotation.w)
        .normalize();
    }
  }, [capsuleCollider, position, rotation]);

  useEffect(() => {
    remoteTransformInitializedRef.current = false;
  }, [capsuleCollider]);

  useEyeBlink(vrmRef);

  const { triggerExpression, stopExpression } = useVRMExpressions(vrmRef);

  useEffect(() => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;

    let cancelled = false;
    let loadedScene = null;
    let loadedVrmInstance = null;
    let ownedGroup = null;
    let animMixer = null;
    let ownedActions = null;
    let sceneAttached = false;
    let sceneDisposed = false;

    const isCancelled = () =>
      cancelled || loadGenerationRef.current !== generation;

    const dispatchLoadingEvent = (eventName, detail) => {
      if (
        typeof window !== 'undefined' &&
        !silentLoadingRef.current
      ) {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
      }
    };

    const releaseOwnedResources = () => {
      const scene = loadedVrmInstance?.scene ?? loadedScene;

      if (animMixer) {
        animMixer.stopAllAction();
        if (scene) animMixer.uncacheRoot(scene);
      }

      if (actionsRef.current === ownedActions) {
        actionsRef.current = {};
        currentActionRef.current = null;
      }

      if (mixerRef.current === animMixer) {
        mixerRef.current = null;
      }

      if (
        loadedVrmInstance &&
        vrmRef.current === loadedVrmInstance
      ) {
        stopExpression();
        vrmRef.current = null;
      }

      if (sceneAttached && ownedGroup && scene?.parent === ownedGroup) {
        ownedGroup.remove(scene);
      }
      sceneAttached = false;

      if (ownedGroup?.rigidBodyRef === rigidBodyRef) {
        delete ownedGroup.rigidBodyRef;
      }

      if (scene && !sceneDisposed) {
        VRMUtils.deepDispose(scene);
        sceneDisposed = true;
      }

      animMixer = null;
      loadedVrmInstance = null;
      loadedScene = null;
      ownedActions = null;
      ownedGroup = null;
    };

    const loadBaseClip = async (url, name) => {
      try {
        return await loadMixamoAnimation(
          url,
          loadedVrmInstance,
          name,
          isCancelled,
        );
      } catch (error) {
        if (!isCancelled()) {
          console.error(`Erreur lors du chargement de l'animation ${name}:`, error);
        }
        return null;
      }
    };

    const loadVrm = async () => {
      try {
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        const gltf = await loader.loadAsync(vrmUrl);
        loadedScene = gltf.scene;
        loadedVrmInstance = gltf.userData.vrm;

        if (!loadedVrmInstance) {
          throw new Error(`Le fichier ${vrmUrl} ne contient pas de VRM valide.`);
        }

        if (isCancelled()) {
          releaseOwnedResources();
          return;
        }

        // Ordre volontairement conservateur : réduire les buffers, mutualiser les
        // squelettes, puis ne garder que les morphs réellement pilotés par le VRM.
        VRMUtils.removeUnnecessaryVertices(loadedVrmInstance.scene);
        VRMUtils.combineSkeletons(loadedVrmInstance.scene);
        VRMUtils.combineMorphs(loadedVrmInstance);

        loadedVrmInstance.scene.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          // Les bounds statiques d'un SkinnedMesh ne suivent pas toujours les
          // animations : les culler peut faire disparaître des membres à l'écran.
          object.frustumCulled = !object.isSkinnedMesh;
          if (Array.isArray(object.material)) object.material.forEach(applyAvatarRim);
          else applyAvatarRim(object.material);
        });

        if (isCancelled() || !groupRef.current) {
          releaseOwnedResources();
          return;
        }

        ownedGroup = groupRef.current;
        ownedGroup.add(loadedVrmInstance.scene);
        sceneAttached = true;
        vrmRef.current = loadedVrmInstance;

        animMixer = new THREE.AnimationMixer(loadedVrmInstance.scene);
        mixerRef.current = animMixer;

        const [idleClip, walkClip, runClip] = await Promise.all([
          loadBaseClip(idleAnimationUrl, 'idle'),
          loadBaseClip(walkAnimationUrl, 'walk'),
          loadBaseClip(runAnimationUrl, 'run'),
        ]);

        if (isCancelled()) return;

        const nextActions = {};
        if (idleClip) nextActions.idle = animMixer.clipAction(idleClip);
        if (walkClip) nextActions.walk = animMixer.clipAction(walkClip);
        if (runClip) nextActions.run = animMixer.clipAction(runClip);

        ownedActions = nextActions;
        actionsRef.current = nextActions;

        const initialAction =
          nextActions.idle ?? nextActions.walk ?? nextActions.run ?? null;

        if (initialAction) {
          initialAction.reset().setEffectiveWeight(1).play();
          currentActionRef.current = initialAction;
        } else {
          currentActionRef.current = null;
          console.error('Aucune animation na pu être initialisée.');
        }

        if (isCancelled()) return;

        ownedGroup.rigidBodyRef = capsuleCollider ? rigidBodyRef : null;
        onLoadRef.current?.(ownedGroup);

        if (isCancelled()) return;

        setVrmRevision((revision) => revision + 1);
        dispatchLoadingEvent('vrm-loading-success');
      } catch (error) {
        if (isCancelled()) return;

        console.error('Erreur de chargement VRM:', error);
        releaseOwnedResources();
        dispatchLoadingEvent('vrm-loading-error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    if (vrmUrl) {
      dispatchLoadingEvent('vrm-loading-start');
      void loadVrm();
    }

    return () => {
      cancelled = true;
      emoteRequestRef.current += 1;
      releaseOwnedResources();
    };
  }, [
    vrmUrl,
    idleAnimationUrl,
    walkAnimationUrl,
    runAnimationUrl,
    capsuleCollider,
    stopExpression,
  ]);

  useEffect(() => {
    const animMixer = mixerRef.current;
    const loadedVrmInstance = vrmRef.current;
    const requestId = emoteRequestRef.current + 1;
    emoteRequestRef.current = requestId;
    let cancelled = false;

    const removeCurrentEmoteAction = () => {
      const emoteAction = actionsRef.current.emote;
      if (!emoteAction || !animMixer) return;

      if (currentActionRef.current === emoteAction) {
        currentActionRef.current = null;
      }

      emoteAction.stop();
      animMixer.uncacheAction(emoteAction.getClip());
      delete actionsRef.current.emote;
    };

    if (!animMixer || !loadedVrmInstance || !emoteAnimationUrl) {
      return () => {
        cancelled = true;
      };
    }

    // Conserver l'action terminée quand l'émote prend fin permet de la fondre
    // proprement vers la locomotion. Elle sera libérée au prochain changement.
    removeCurrentEmoteAction();

    const loadEmoteAnimation = async () => {
      try {
        const emoteClip = await loadMixamoAnimation(
          emoteAnimationUrl,
          loadedVrmInstance,
          'emote',
          () =>
            cancelled ||
            emoteRequestRef.current !== requestId ||
            mixerRef.current !== animMixer ||
            vrmRef.current !== loadedVrmInstance,
        );

        if (
          !emoteClip ||
          cancelled ||
          emoteRequestRef.current !== requestId ||
          mixerRef.current !== animMixer ||
          vrmRef.current !== loadedVrmInstance
        ) {
          return;
        }

        const emoteAction = animMixer.clipAction(emoteClip);
        emoteAction.setEffectiveWeight(0);
        emoteAction.setLoop(THREE.LoopOnce, 1);
        emoteAction.clampWhenFinished = true;
        actionsRef.current.emote = emoteAction;
      } catch (error) {
        if (!cancelled && emoteRequestRef.current === requestId) {
          console.error(
            "Erreur lors du chargement de l'animation d'émote:",
            error,
          );
        }
      }
    };

    void loadEmoteAnimation();

    return () => {
      cancelled = true;
    };
  }, [emoteAnimationUrl, vrmRevision]);

  useEffect(() => {
    if (!vrmRef.current) return;

    if (emoteExpression && currentEmoteType === 'expression') {
      triggerExpression(emoteExpression, 1.0, 3000);
    } else if (!emoteExpression && currentEmoteType !== 'animation') {
      stopExpression();
    }
  }, [
    emoteExpression,
    currentEmoteType,
    triggerExpression,
    stopExpression,
    vrmRevision,
  ]);

  useFrame((_, delta) => {
    const animMixer = mixerRef.current;
    const loadedVrmInstance = vrmRef.current;
    const group = groupRef.current;

    animMixer?.update(delta);
    loadedVrmInstance?.update(delta);

    if (group) {
      if (capsuleCollider && rigidBodyRef.current && movementDirection) {
        const rigidBody = rigidBodyRef.current;
        const speed = locomotion === 'run' ? runSpeed : walkSpeed;
        const hasMovement = movementDirection.lengthSq() > 0;
        const currentVelocity = rigidBody.linvel();
        const nextVelocity = nextLinearVelocityRef.current;

        nextVelocity.x = hasMovement ? movementDirection.x * speed : 0;
        nextVelocity.y = currentVelocity.y;
        nextVelocity.z = hasMovement ? movementDirection.z * speed : 0;
        rigidBody.setLinvel(nextVelocity, true);

        if (hasMovement) {
          const angle = Math.atan2(movementDirection.x, movementDirection.z);
          targetQuaternionRef.current.setFromAxisAngle(
            yAxis,
            angle + modelDirectionOffset,
          );
          const rotationAlpha =
            1 -
            Math.exp(
              -LOCAL_ROTATION_RESPONSE *
                Math.min(delta, MAX_INTERPOLATION_DELTA),
            );
          group.quaternion.slerp(targetQuaternionRef.current, rotationAlpha);
        }

        const horizontalSpeed = Math.hypot(
          currentVelocity.x,
          currentVelocity.z,
        );
        const isBlocked =
          hasMovement &&
          horizontalSpeed < speed * 0.3 &&
          Math.abs(currentVelocity.y) < 0.3;

        // Aide à la montée des marches : uniquement si l'obstacle est bas (rayon genou touché,
        // rayon taille libre), ce qui empêche d'escalader les murs et les troncs.
        if (isBlocked) {
          stuckTimeRef.current += delta;
          if (stuckTimeRef.current > 0.12) {
            const origin = rigidBody.translation();
            const probe = (height) => {
              stepRay.origin.x = origin.x;
              stepRay.origin.y = origin.y + height;
              stepRay.origin.z = origin.z;
              stepRay.dir.x = movementDirection.x;
              stepRay.dir.y = 0;
              stepRay.dir.z = movementDirection.z;
              return world.castRay(
                stepRay,
                STEP_PROBE_LENGTH,
                true,
                rapier.QueryFilterFlags.EXCLUDE_SENSORS,
                undefined,
                undefined,
                rigidBody,
              );
            };
            if (probe(STEP_PROBE_LOW) && !probe(STEP_PROBE_HIGH)) {
              nextVelocity.y = STEP_HOP_VELOCITY;
              rigidBody.setLinvel(nextVelocity, true);
            }
            stuckTimeRef.current = 0;
          }
        } else {
          stuckTimeRef.current = 0;
        }

        const translation = rigidBody.translation();
        if (translation.y < RESPAWN_HEIGHT) {
          rigidBody.setTranslation(RESPAWN_POSITION, true);
          rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      } else if (!capsuleCollider) {
        const interpolationDelta = Math.min(
          delta,
          MAX_INTERPOLATION_DELTA,
        );

        if (!remoteTransformInitializedRef.current) {
          group.position.copy(remoteTargetPositionRef.current);
          group.quaternion.copy(remoteTargetQuaternionRef.current);
          remoteTransformInitializedRef.current = true;
        } else {
          const positionAlpha =
            1 - Math.exp(-REMOTE_POSITION_RESPONSE * interpolationDelta);
          const rotationAlpha =
            1 - Math.exp(-REMOTE_ROTATION_RESPONSE * interpolationDelta);
          group.position.lerp(remoteTargetPositionRef.current, positionAlpha);
          group.quaternion.slerp(
            remoteTargetQuaternionRef.current,
            rotationAlpha,
          );
        }
      } else {
        stuckTimeRef.current = 0;
      }
    }

    if (animMixer) {
      const actions = actionsRef.current;
      const emoteAction =
        currentEmote &&
        currentEmoteType === 'animation' &&
        actions.emote
          ? actions.emote
          : null;
      const targetAction = emoteAction ?? (
        locomotion ? actions[locomotion] : null
      );
      const previousAction = currentActionRef.current;

      if (targetAction && targetAction !== previousAction) {
        targetAction
          .reset()
          .setEffectiveWeight(1)
          .fadeIn(emoteAction ? 0.2 : 0.3)
          .play();
        previousAction?.fadeOut(emoteAction ? 0.2 : 0.3);
        currentActionRef.current = targetAction;
      }
    }
  });

  if (capsuleCollider) {
    return (
      <RigidBody
        ref={rigidBodyRef}
        position={position}
        colliders={false}
        mass={1}
        type="dynamic"
        enabledRotations={[false, true, false]}
        lockRotations={true}
        linearDamping={0.8}
        angularDamping={0.8}
        friction={0.5}
        restitution={0.1}
        gravityScale={1.5}
        canSleep={false}
        ccd={true}
      >
        <group ref={groupRef} scale={scale}>
          {audioListener && stepSoundBuffers && (
            <FootstepAudio
              audioListener={audioListener}
              stepSoundBuffers={stepSoundBuffers}
              targetRef={groupRef}
              locomotion={locomotion}
            />
          )}
          {paths && (
            <DirtRunParticles
              targetRef={groupRef}
              locomotion={locomotion}
              movementDirection={movementDirection}
              paths={paths}
            />
          )}
        </group>
        <CapsuleCollider
          args={[0.7, 0.3]}
          position={[0, 1.0, 0]}
          friction={0}
          frictionCombineRule={rapier.CoefficientCombineRule.Min}
        />
      </RigidBody>
    );
  }

  return (
    <group ref={groupRef} scale={scale}>
      {audioListener && stepSoundBuffers && (
        <FootstepAudio
          audioListener={audioListener}
          stepSoundBuffers={stepSoundBuffers}
          targetRef={groupRef}
          locomotion={locomotion}
        />
      )}
    </group>
  );
}
