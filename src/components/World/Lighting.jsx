import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LIGHTING, SUN_DIRECTION } from './environment';

const LIGHT_DISTANCE = 90;

// Soleil + lumière d'ambiance ciel/sol. La zone d'ombre suit la caméra et reste alignée
// sur la grille des texels de la shadow map pour éviter le scintillement des ombres.
const Lighting = memo(function Lighting({ shadowMapSize = 2048, shadowExtent = 34 }) {
  const lightRef = useRef();
  const scene = useThree((state) => state.scene);
  const target = useMemo(() => new THREE.Object3D(), []);

  const lightBasis = useMemo(() => {
    const z = SUN_DIRECTION.clone();
    const x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x).normalize();
    return { x, y, z };
  }, []);

  const scratch = useMemo(
    () => ({ forward: new THREE.Vector3(), focus: new THREE.Vector3() }),
    [],
  );

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;

    light.target = target;
    const { shadow } = light;
    shadow.mapSize.set(shadowMapSize, shadowMapSize);
    shadow.camera.left = -shadowExtent;
    shadow.camera.right = shadowExtent;
    shadow.camera.top = shadowExtent;
    shadow.camera.bottom = -shadowExtent;
    shadow.camera.near = 1;
    shadow.camera.far = LIGHT_DISTANCE * 2;
    shadow.camera.updateProjectionMatrix();
    shadow.bias = -0.0003;
    shadow.normalBias = 0.035;

    if (shadow.map) {
      shadow.map.dispose();
      shadow.map = null;
    }
    shadow.needsUpdate = true;
  }, [shadowMapSize, shadowExtent, target]);

  useFrame(({ camera }) => {
    const light = lightRef.current;
    if (!light) return;

    const { forward, focus } = scratch;
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();

    focus.copy(camera.position).addScaledVector(forward, shadowExtent * 0.45);
    focus.y = 0;

    const texel = (shadowExtent * 2) / shadowMapSize;
    const lx = Math.round(focus.dot(lightBasis.x) / texel) * texel;
    const ly = Math.round(focus.dot(lightBasis.y) / texel) * texel;
    const lz = focus.dot(lightBasis.z);
    focus
      .copy(lightBasis.x)
      .multiplyScalar(lx)
      .addScaledVector(lightBasis.y, ly)
      .addScaledVector(lightBasis.z, lz);

    target.position.copy(focus);
    target.updateMatrixWorld();
    light.position.copy(focus).addScaledVector(SUN_DIRECTION, LIGHT_DISTANCE);
  });

  return (
    <>
      <hemisphereLight
        args={[LIGHTING.hemiSkyColor, LIGHTING.hemiGroundColor, LIGHTING.hemiIntensity]}
      />
      <directionalLight
        ref={lightRef}
        castShadow
        color={LIGHTING.sunColor}
        intensity={LIGHTING.sunIntensity}
      />
    </>
  );
});

export default Lighting;
