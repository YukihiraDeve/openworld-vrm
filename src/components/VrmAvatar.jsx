import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { mixamoVRMRigMap } from '../const'; // ✅ Import de la map

// 🔁 Fonction de conversion de l'animation Mixamo pour VRM
async function loadMixamoAnimation(url, vrm) {
  const loader = new FBXLoader();
  const asset = await loader.loadAsync(url);
  const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com');

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

  return new THREE.AnimationClip('vrmAnimation', clip.duration, tracks);
}

// 🎭 Composant principal VRM + animation
export default function VrmAvatar({
  vrmUrl,
  animationUrl,
  position = [0, 0, 0],
  scale = 1,
}) {
  const ref = useRef();
  const [vrm, setVrm] = useState(null);
  const [mixer, setMixer] = useState(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(vrmUrl, async (gltf) => {
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      const loadedVrm = gltf.userData.vrm;
      loadedVrm.scene.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false; // optionnel pour éviter des artefacts de disparition
        }
      });
      ref.current.add(loadedVrm.scene);
      setVrm(loadedVrm);

      const clip = await loadMixamoAnimation(animationUrl, loadedVrm);
      const animMixer = new THREE.AnimationMixer(loadedVrm.scene);
      animMixer.clipAction(clip).play();
      setMixer(animMixer);
    });
  }, [vrmUrl, animationUrl]);

  useFrame((_, delta) => {
    if (vrm) vrm.update(delta);
    if (mixer) mixer.update(delta);
  });

  return <group ref={ref} position={position} scale={scale} />;
}
