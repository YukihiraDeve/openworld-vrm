import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { BallCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { TREE_MODEL_PATH, findLeafTexture } from './FluffyTreeShared';
import { getVegetationLayout } from './vegetationLayout';
import { WALL_HALF_SIZE } from './terrain';
import { CARD_TREE_VARIANTS, createCardTreeGeometry } from './treeGeometry';
import {
  createCanopyDepthMaterial,
  createCanopyMaterial,
  createTrunkMaterial,
  pickTreeTint,
} from './treeMaterials';

const CAMERA_SENSOR_BAND = 13;

function canopyBounds(variant) {
  const center = new THREE.Vector3();
  variant.blobs.forEach(([x, y, z]) => center.add(new THREE.Vector3(x, y, z)));
  center.divideScalar(variant.blobs.length);
  const radius = Math.max(
    ...variant.blobs.map(([x, y, z, r]) => center.distanceTo(new THREE.Vector3(x, y, z)) + r),
  );
  return { center, radius: radius * 0.75 };
}

const VARIANT_BOUNDS = CARD_TREE_VARIANTS.map(canopyBounds);

const EDGE_CANOPY_COLORS = {
  inner: '#23421a',
  outer: '#4f8430',
  highlight: '#98c24c',
};

const VariantTrees = memo(function VariantTrees({ trees, geometry, canopyMaterial, depthMaterial, trunkMaterial }) {
  const canopyRef = useRef();
  const trunkRef = useRef();

  useLayoutEffect(() => {
    const canopy = canopyRef.current;
    const trunk = trunkRef.current;
    if (!canopy || !trunk) return;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    trees.forEach((tree, index) => {
      dummy.position.set(tree.x, tree.y - 0.1, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      canopy.setMatrixAt(index, dummy.matrix);
      trunk.setMatrixAt(index, dummy.matrix);
      canopy.setColorAt(index, pickTreeTint(tree.tint, color));
    });
    canopy.instanceMatrix.needsUpdate = true;
    trunk.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    canopy.computeBoundingSphere();
    trunk.computeBoundingSphere();
  }, [trees]);

  return (
    <>
      <instancedMesh ref={trunkRef} args={[geometry.trunk, trunkMaterial, trees.length]} castShadow receiveShadow />
      <instancedMesh
        ref={canopyRef}
        args={[geometry.canopy, canopyMaterial, trees.length]}
        customDepthMaterial={depthMaterial}
        castShadow
        receiveShadow
      />
    </>
  );
});

// Lisière de forêt dense juste derrière les limites du monde
const ForestEdge = memo(function ForestEdge({ paths = [], alphaToCoverage = false }) {
  const { scene } = useGLTF(TREE_MODEL_PATH);
  const leafTexture = useMemo(() => findLeafTexture(scene), [scene]);
  const ringTrees = useMemo(() => getVegetationLayout(paths).ringTrees, [paths]);

  const geometries = useMemo(
    () => CARD_TREE_VARIANTS.map((variant, index) => createCardTreeGeometry(variant, 1000 + index * 17)),
    [],
  );
  const canopyMaterial = useMemo(
    () => createCanopyMaterial(leafTexture, { alphaToCoverage, colors: EDGE_CANOPY_COLORS }),
    [leafTexture, alphaToCoverage],
  );
  const depthMaterial = useMemo(() => createCanopyDepthMaterial(leafTexture), [leafTexture]);
  const trunkMaterial = useMemo(() => createTrunkMaterial('#6f5038'), []);

  const groups = useMemo(
    () => CARD_TREE_VARIANTS.map((_, index) => ringTrees.filter((tree) => tree.variant === index)),
    [ringTrees],
  );

  const cameraSpheres = useMemo(
    () => ringTrees
      .filter((tree) => Math.max(Math.abs(tree.x), Math.abs(tree.z)) - WALL_HALF_SIZE < CAMERA_SENSOR_BAND)
      .map((tree) => {
        const { center, radius } = VARIANT_BOUNDS[tree.variant];
        const cos = Math.cos(tree.rotation);
        const sin = Math.sin(tree.rotation);
        return {
          position: [
            tree.x + (center.x * cos + center.z * sin) * tree.scale,
            tree.y + center.y * tree.scale,
            tree.z + (-center.x * sin + center.z * cos) * tree.scale,
          ],
          radius: radius * tree.scale,
        };
      }),
    [ringTrees],
  );

  useEffect(() => () => geometries.forEach(({ canopy, trunk }) => {
    canopy.dispose();
    trunk.dispose();
  }), [geometries]);
  useEffect(() => () => canopyMaterial.dispose(), [canopyMaterial]);
  useEffect(() => () => depthMaterial.dispose(), [depthMaterial]);
  useEffect(() => () => trunkMaterial.dispose(), [trunkMaterial]);

  return (
    <group>
      {groups.map((trees, index) => trees.length > 0 && (
        <VariantTrees
          key={index}
          trees={trees}
          geometry={geometries[index]}
          canopyMaterial={canopyMaterial}
          depthMaterial={depthMaterial}
          trunkMaterial={trunkMaterial}
        />
      ))}
      <RigidBody type="fixed" colliders={false}>
        {cameraSpheres.map((sphere, index) => (
          <BallCollider key={index} sensor args={[sphere.radius]} position={sphere.position} />
        ))}
      </RigidBody>
    </group>
  );
});

export default ForestEdge;
