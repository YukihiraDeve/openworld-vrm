import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BallCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { TREE_MODEL_PATH, isCanopy, isTrunk } from './FluffyTreeShared';
import { getVegetationLayout } from './vegetationLayout';
import {
  applyCanopyAttributes,
  createCanopyDepthMaterial,
  createCanopyMaterial,
  createTrunkMaterial,
  pickTreeTint,
} from './treeMaterials';

function prepareTreeGeometry(scene) {
  const canopyParts = [];
  const trunkParts = [];
  let leafTexture = null;

  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);

    if (isCanopy(object.name)) {
      canopyParts.push(geometry);
      leafTexture = leafTexture || object.material.map;
    } else if (isTrunk(object.name)) {
      trunkParts.push(geometry);
    } else {
      geometry.dispose();
    }
  });

  applyCanopyAttributes(canopyParts);
  const canopySpheres = canopyParts.map((geometry) => ({
    center: geometry.boundingSphere.center.clone(),
    radius: geometry.boundingSphere.radius * 0.72,
  }));
  const canopyGeometry = mergeGeometries(canopyParts);
  const trunkGeometry = mergeGeometries(trunkParts);
  canopyParts.forEach((geometry) => geometry.dispose());
  trunkParts.forEach((geometry) => geometry.dispose());

  trunkGeometry.computeBoundingBox();
  canopyGeometry.computeBoundingBox();
  const { min } = trunkGeometry.boundingBox;
  const base = new THREE.Box3();
  const point = new THREE.Vector3();
  const positions = trunkGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    if (point.y < min.y + 0.9) base.expandByPoint(point);
  }
  const baseSize = base.getSize(new THREE.Vector3());

  return {
    canopyGeometry,
    trunkGeometry,
    canopySpheres,
    leafTexture,
    trunkRadius: Math.min(baseSize.x, baseSize.z) * 0.42,
    trunkHeight: canopyGeometry.boundingBox.max.y - min.y,
  };
}

const FluffyTrees = memo(function FluffyTrees({ paths = [], alphaToCoverage = false }) {
  const { scene } = useGLTF(TREE_MODEL_PATH);
  const trees = useMemo(() => getVegetationLayout(paths).heroTrees, [paths]);
  const prepared = useMemo(() => prepareTreeGeometry(scene), [scene]);
  const canopyRef = useRef();
  const trunkRef = useRef();

  const canopyMaterial = useMemo(
    () => createCanopyMaterial(prepared.leafTexture, { alphaToCoverage }),
    [prepared.leafTexture, alphaToCoverage],
  );
  const canopyDepthMaterial = useMemo(
    () => createCanopyDepthMaterial(prepared.leafTexture),
    [prepared.leafTexture],
  );
  const trunkMaterial = useMemo(() => createTrunkMaterial(), []);

  // Sphères « capteurs » invisibles : la caméra s'arrête avant d'entrer dans un feuillage
  const cameraSpheres = useMemo(() => {
    const spheres = [];
    trees.forEach((tree) => {
      const cos = Math.cos(tree.rotation);
      const sin = Math.sin(tree.rotation);
      prepared.canopySpheres.forEach(({ center, radius }) => {
        spheres.push({
          position: [
            tree.x + (center.x * cos + center.z * sin) * tree.scale,
            tree.y + center.y * tree.scale,
            tree.z + (-center.x * sin + center.z * cos) * tree.scale,
          ],
          radius: radius * tree.scale,
        });
      });
    });
    return spheres;
  }, [trees, prepared]);

  useLayoutEffect(() => {
    const canopy = canopyRef.current;
    const trunk = trunkRef.current;
    if (!canopy || !trunk) return;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    trees.forEach((tree, index) => {
      dummy.position.set(tree.x, tree.y - 0.05, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      canopy.setMatrixAt(index, dummy.matrix);
      trunk.setMatrixAt(index, dummy.matrix);
      canopy.setColorAt(index, pickTreeTint(tree.tint, color));
    });
    canopy.count = trees.length;
    trunk.count = trees.length;
    canopy.instanceMatrix.needsUpdate = true;
    trunk.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    canopy.computeBoundingSphere();
    trunk.computeBoundingSphere();
  }, [trees, canopyMaterial]);

  useEffect(() => () => {
    prepared.canopyGeometry.dispose();
    prepared.trunkGeometry.dispose();
  }, [prepared]);
  useEffect(() => () => canopyMaterial.dispose(), [canopyMaterial]);
  useEffect(() => () => canopyDepthMaterial.dispose(), [canopyDepthMaterial]);
  useEffect(() => () => trunkMaterial.dispose(), [trunkMaterial]);

  return (
    <>
      <instancedMesh
        ref={trunkRef}
        args={[prepared.trunkGeometry, trunkMaterial, trees.length]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={canopyRef}
        args={[prepared.canopyGeometry, canopyMaterial, trees.length]}
        customDepthMaterial={canopyDepthMaterial}
        castShadow
        receiveShadow
      />
      <RigidBody type="fixed" colliders={false}>
        {trees.map((tree, index) => {
          const radius = Math.max(prepared.trunkRadius * tree.scale, 0.25);
          const halfHeight = (prepared.trunkHeight * tree.scale) / 2;
          return (
            <CylinderCollider
              key={index}
              args={[halfHeight, radius]}
              position={[tree.x, tree.y + halfHeight, tree.z]}
            />
          );
        })}
        {cameraSpheres.map((sphere, index) => (
          <BallCollider key={`canopy-${index}`} sensor args={[sphere.radius]} position={sphere.position} />
        ))}
      </RigidBody>
    </>
  );
});

useGLTF.preload(TREE_MODEL_PATH);

export default FluffyTrees;
