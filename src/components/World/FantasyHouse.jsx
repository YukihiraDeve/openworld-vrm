import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FANTASY_HOUSE_CONFIG } from './worldConfig';
import { sharedUniforms } from './environment';

const MATERIAL_COLORS = Object.freeze({
  MAT_Plaster_Ivory: '#dccdae',
  MAT_Stone_Foundation: '#857e72',
  MAT_Stone_Light: '#bdb6a6',
  MAT_Wood_Walnut: '#6b4424',
  MAT_Wood_Honey: '#b07236',
  MAT_Roof_Teal: '#2b8795',
  MAT_Leaf_Green: '#5f9a2e',
});

const UNSHADED_MATERIALS = new Set(['MAT_Lantern_Glow', 'MAT_Glass_Blue']);

// Variation procédurale (bruit triplanaire en espace monde) et assombrissement au contact du sol
function applyHouseShading(material) {
  const uniforms = {
    uNoiseTexture: sharedUniforms.uNoiseTexture,
    uHouseBase: { value: FANTASY_HOUSE_CONFIG.position[1] },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vHouseWorld;
        varying vec3 vHouseNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vHouseWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vHouseNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoiseTexture;
        uniform float uHouseBase;
        varying vec3 vHouseWorld;
        varying vec3 vHouseNormal;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 houseBlend = abs(normalize(vHouseNormal));
        houseBlend /= houseBlend.x + houseBlend.y + houseBlend.z;
        float houseNoise =
          texture2D(uNoiseTexture, vHouseWorld.zy * 0.3).g * houseBlend.x +
          texture2D(uNoiseTexture, vHouseWorld.xz * 0.3).g * houseBlend.y +
          texture2D(uNoiseTexture, vHouseWorld.xy * 0.3).g * houseBlend.z;
        float houseGrain =
          texture2D(uNoiseTexture, vHouseWorld.zy * 1.7).b * houseBlend.x +
          texture2D(uNoiseTexture, vHouseWorld.xz * 1.7).b * houseBlend.y +
          texture2D(uNoiseTexture, vHouseWorld.xy * 1.7).b * houseBlend.z;
        diffuseColor.rgb *= mix(0.84, 1.1, houseNoise) * mix(0.94, 1.04, houseGrain);`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        float houseContact = smoothstep(0.0, 1.2, vHouseWorld.y - uHouseBase);
        reflectedLight.indirectDiffuse *= mix(0.5, 1.0, houseContact);
        reflectedLight.directDiffuse *= mix(0.78, 1.0, houseContact);`,
      );
  };
  material.customProgramCacheKey = () => `fantasy-house-${material.type}`;
}

const LANTERN_INTENSITIES = Object.freeze({
  Lantern_Entry_Right_Point: 30,
  Lantern_Balcony_Corner_Point: 24,
  Lantern_Right_Side_Point: 22,
});

const STAIR_RAMP = Object.freeze({
  halfExtents: Object.freeze([2.05, 0.08, 1.2677]),
  position: Object.freeze([-0.7, 0.711, 6.1799]),
  rotation: Object.freeze([0.65706, 0, 0]),
});

const HOUSE_BOX_COLLIDERS = Object.freeze([
  // Volumes structurels principaux, mesurés dans le glTF.
  Object.freeze({
    id: 'main-block',
    halfExtents: Object.freeze([5, 3.65, 3.6]),
    position: Object.freeze([0.5, 3.65, 0]),
  }),
  Object.freeze({
    id: 'left-wing',
    halfExtents: Object.freeze([1.8, 2.65, 2.95]),
    position: Object.freeze([-5.75, 2.65, 0.75]),
  }),
  Object.freeze({
    id: 'entry',
    halfExtents: Object.freeze([2.25, 3.59, 0.75]),
    position: Object.freeze([-0.7, 3.59, 4.05]),
  }),
  Object.freeze({
    id: 'rear',
    halfExtents: Object.freeze([2.1, 3.5275, 0.5]),
    position: Object.freeze([0.7, 3.5275, -3.8]),
  }),

  // Couronnement incliné et palier des deux joues d’escalier.
  Object.freeze({
    id: 'stair-cheek-left-slope',
    halfExtents: Object.freeze([0.27, 1.0916, 0.14]),
    position: Object.freeze([-3.19, 1.055, 5.845]),
    rotation: Object.freeze([-0.9604, 0, 0]),
  }),
  Object.freeze({
    id: 'stair-cheek-right-slope',
    halfExtents: Object.freeze([0.27, 1.0916, 0.14]),
    position: Object.freeze([1.79, 1.055, 5.845]),
    rotation: Object.freeze([-0.9604, 0, 0]),
  }),
  Object.freeze({
    id: 'stair-cheek-left-landing',
    halfExtents: Object.freeze([0.27, 0.6, 0.14]),
    position: Object.freeze([-3.19, 1.68, 4.35]),
    rotation: Object.freeze([-Math.PI / 2, 0, 0]),
  }),
  Object.freeze({
    id: 'stair-cheek-right-landing',
    halfExtents: Object.freeze([0.27, 0.6, 0.14]),
    position: Object.freeze([1.79, 1.68, 4.35]),
    rotation: Object.freeze([-Math.PI / 2, 0, 0]),
  }),

  // Accessoires posés devant la façade.
  Object.freeze({
    id: 'crate-large',
    halfExtents: Object.freeze([0.47, 0.44, 0.44]),
    position: Object.freeze([3.25, 0.5, 5.083]),
  }),
  Object.freeze({
    id: 'crate-small',
    halfExtents: Object.freeze([0.34, 0.31, 0.32]),
    position: Object.freeze([4.18, 0.366, 5.088]),
  }),
]);

function getMaterialKey(material, geometry) {
  return [
    material.uuid,
    geometry.index ? 'indexed' : 'non-indexed',
    Object.keys(geometry.attributes).sort().join(','),
  ].join('|');
}

function prepareHouse(sourceScene) {
  const house = sourceScene.clone(true);
  house.name = 'MaisonFantasy';
  house.updateMatrixWorld(true);

  const materialClones = new Map();
  const mergedGeometrySources = new Map();
  const staticMeshes = [];

  const getTunedMaterial = (sourceMaterial) => {
    if (materialClones.has(sourceMaterial.uuid)) {
      return materialClones.get(sourceMaterial.uuid);
    }

    const material = sourceMaterial.clone();
    const correctedColor = MATERIAL_COLORS[material.name];

    if (correctedColor && material.color) {
      material.color.set(correctedColor);
    }

    if (material.name === 'MAT_Lantern_Glow') {
      material.color.set('#9b4a1c');
      material.emissive.set('#ffc07a');
      material.emissiveIntensity = 2.2;
      material.toneMapped = true;
    }

    if (material.name === 'MAT_Glass_Blue') {
      material.roughness = 0.08;
      material.metalness = 0.15;
      material.envMapIntensity = 1.4;
    }

    if (!UNSHADED_MATERIALS.has(material.name)) applyHouseShading(material);

    material.needsUpdate = true;
    materialClones.set(sourceMaterial.uuid, material);
    return material;
  };

  house.traverse((object) => {
    if (object.isPointLight) {
      object.userData.exportedIntensity = object.intensity;
      object.intensity = LANTERN_INTENSITIES[object.name] ?? 24;
      object.color.set('#ffd0a0');
      object.castShadow = false;
      object.decay = 2;
      object.distance = 4.5;
      return;
    }

    if (!object.isMesh) return;

    const sourceMaterial = Array.isArray(object.material)
      ? object.material[0]
      : object.material;
    const material = getTunedMaterial(sourceMaterial);

    object.material = material;
    object.castShadow = true;
    object.receiveShadow = true;

    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.clearGroups();

    const key = getMaterialKey(material, geometry);
    if (!mergedGeometrySources.has(key)) {
      mergedGeometrySources.set(key, { material, geometries: [] });
    }
    mergedGeometrySources.get(key).geometries.push(geometry);
    staticMeshes.push(object);
  });

  staticMeshes.forEach((mesh) => mesh.removeFromParent());

  const staticGroup = new THREE.Group();
  staticGroup.name = 'MaisonFantasy_StaticBatches';
  const mergedGeometries = [];

  mergedGeometrySources.forEach(({ material, geometries }, key) => {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((source) => source.dispose());

    if (!geometry) {
      console.warn(`[MaisonFantasy] Fusion impossible pour ${key}.`);
      return;
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mergedGeometries.push(geometry);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `MaisonFantasy_Static_${material.name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    staticGroup.add(mesh);
  });

  house.add(staticGroup);
  house.updateMatrixWorld(true);

  return {
    house,
    mergedGeometries,
    materials: [...materialClones.values()],
  };
}

const FantasyHouse = memo(function FantasyHouse() {
  const { scene } = useGLTF(FANTASY_HOUSE_CONFIG.url);
  const prepared = useMemo(() => prepareHouse(scene), [scene]);

  useEffect(() => {
    return () => {
      prepared.mergedGeometries.forEach((geometry) => geometry.dispose());
      prepared.materials.forEach((material) => material.dispose());
    };
  }, [prepared]);

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={FANTASY_HOUSE_CONFIG.position}
      rotation={FANTASY_HOUSE_CONFIG.rotation}
    >
      <primitive object={prepared.house} />

      {HOUSE_BOX_COLLIDERS.map((collider) => (
        <CuboidCollider
          key={collider.id}
          args={collider.halfExtents}
          position={collider.position}
          rotation={collider.rotation}
          friction={0.9}
          restitution={0}
        />
      ))}

      {/* Rampe physique continue sous les cinq marches, du terrain au palier. */}
      <CuboidCollider
        args={STAIR_RAMP.halfExtents}
        position={STAIR_RAMP.position}
        rotation={STAIR_RAMP.rotation}
        friction={0.9}
        restitution={0}
      />

      <CuboidCollider
        args={[2, 0.15, 0.7375]}
        position={[-0.7, 1.4, 4.4875]}
        friction={0.9}
        restitution={0}
      />

      <CylinderCollider
        args={[0.5, 0.57]}
        position={[5.05, 0.529, 5.02]}
        friction={0.85}
        restitution={0}
      />
    </RigidBody>
  );
});

export default FantasyHouse;

useGLTF.preload(FANTASY_HOUSE_CONFIG.url);
