import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getVegetationLayout } from './vegetationLayout';
import { createDistantBroadleafGeometry, createDistantPineGeometry } from './treeGeometry';

const BROADLEAF_SCALE = 3.3;
const PINE_SCALE = 2.2;
const BROADLEAF_COLORS = ['#3a6428', '#44702c', '#2f5524', '#557b31', '#3d5f2c'].map((hex) => new THREE.Color(hex));
const PINE_COLORS = ['#26462b', '#2d5132', '#223d27', '#335836'].map((hex) => new THREE.Color(hex));

function createDistantTreeMaterial() {
  const material = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTreeHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTreeHeight = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTreeHeight;')
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        float treeOcclusion = smoothstep(0.5, 3.2, vTreeHeight);
        reflectedLight.indirectDiffuse *= mix(0.35, 1.05, treeOcclusion);
        reflectedLight.directDiffuse *= mix(0.6, 1.0, treeOcclusion);`,
      );
  };
  material.customProgramCacheKey = () => 'distant-tree';
  return material;
}

const DistantTreeMesh = memo(function DistantTreeMesh({ trees, geometry, material, palette, scaleFactor }) {
  const ref = useRef();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    trees.forEach((tree, index) => {
      const scale = tree.scale * scaleFactor;
      dummy.position.set(tree.x, tree.y - 0.4, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.set(scale * (0.9 + tree.tint * 0.25), scale * (0.95 + (1 - tree.tint) * 0.2), scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.copy(palette[Math.floor(tree.tint * palette.length) % palette.length]);
      mesh.setColorAt(index, color.multiplyScalar(0.9 + ((tree.tint * 7.31) % 1) * 0.2));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [trees, palette, scaleFactor]);

  return <instancedMesh ref={ref} args={[geometry, material, trees.length]} />;
});

// Forêts basse résolution jusqu'à l'horizon (sans ombres, noyées dans la brume)
const DistantForest = memo(function DistantForest({ paths = [] }) {
  const farTrees = useMemo(() => getVegetationLayout(paths).farTrees, [paths]);
  const broadleaves = useMemo(() => farTrees.filter((tree) => !tree.pine), [farTrees]);
  const pines = useMemo(() => farTrees.filter((tree) => tree.pine), [farTrees]);

  const broadleafGeometry = useMemo(() => createDistantBroadleafGeometry(), []);
  const pineGeometry = useMemo(() => createDistantPineGeometry(), []);
  const material = useMemo(() => createDistantTreeMaterial(), []);

  useEffect(() => () => broadleafGeometry.dispose(), [broadleafGeometry]);
  useEffect(() => () => pineGeometry.dispose(), [pineGeometry]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <group>
      {broadleaves.length > 0 && (
        <DistantTreeMesh
          trees={broadleaves}
          geometry={broadleafGeometry}
          material={material}
          palette={BROADLEAF_COLORS}
          scaleFactor={BROADLEAF_SCALE}
        />
      )}
      {pines.length > 0 && (
        <DistantTreeMesh
          trees={pines}
          geometry={pineGeometry}
          material={material}
          palette={PINE_COLORS}
          scaleFactor={PINE_SCALE}
        />
      )}
    </group>
  );
});

export default DistantForest;
