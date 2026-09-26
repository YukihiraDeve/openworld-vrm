import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { calculateHeight } from './terrain';
import { sharedUniforms } from './environment';
import { DECOR_FENCES, DECOR_PROPS, DECOR_URL, WELL, WINDMILL } from './decorLayout';

// Longueur d'une travée de clôture telle que modélisée (poteau en x = 0, lisses jusqu'au suivant)
const FENCE_SPAN = 2.2;
const SAIL_SPEED = 0.42;

const UNSHADED_MATERIALS = new Set(['MAT_Lantern_Glow', 'MAT_Glass_Blue']);

// Rayon d'appui et enfoncement : la base est posée sur le point le plus bas de son empreinte
const GROUNDING = Object.freeze({
  Windmill: { radius: 3.1, sink: 0.14 },
  Well: { radius: 1.05, sink: 0.08 },
  Cart: { radius: 1.2, sink: 0.03 },
  Log_Pile: { radius: 0.7, sink: 0.04 },
  Hay_Stack: { radius: 0.6, sink: 0.04 },
  Bench: { radius: 0.7, sink: 0.03 },
  // Posé au centre : sur une pente, le point bas enterrerait les citrouilles du côté amont
  Market_Stall: { radius: 0, sink: 0.01 },
  Rock_Small: { radius: 0, sink: 0.05 },
  Rock_Medium: { radius: 0, sink: 0.08 },
  Rock_Large: { radius: 0, sink: 0.12 },
});

const cuboid = (half, offset, rotation) => ({ kind: 'cuboid', args: half, offset, rotation });
const cylinder = (halfHeight, radius, offset) => ({ kind: 'cylinder', args: [halfHeight, radius], offset });

// Volumes de collision dans le repère des modèles (+Z = façade)
const PROP_COLLIDERS = Object.freeze({
  Windmill: [
    cylinder(0.5, 3.05, [0, 0.45, 0]),
    cylinder(3.2, 2.55, [0, 4.1, 0]),
    cuboid([0.95, 0.06, 0.74], [0, 0.44, 3.45], [0.712, 0, 0]),
  ],
  Well: [
    cylinder(0.47, 1.05, [0, 0.47, 0]),
    cuboid([0.09, 1.15, 0.09], [-0.86, 1.2, 0]),
    cuboid([0.09, 1.15, 0.09], [0.86, 1.2, 0]),
  ],
  Lamp_Post: [cuboid([0.27, 0.22, 0.27], [0, 0.2, 0]), cylinder(1.6, 0.12, [0, 1.6, 0])],
  Signpost: [cylinder(1.3, 0.11, [0, 1.3, 0])],
  Bench: [cuboid([0.78, 0.48, 0.3], [0, 0.48, 0])],
  Barrel: [cylinder(0.45, 0.35, [0, 0.45, 0])],
  Crate: [cuboid([0.36, 0.35, 0.36], [0, 0.35, 0])],
  Grain_Sack: [cylinder(0.33, 0.28, [0, 0.33, 0])],
  Sack_Pile: [cuboid([0.58, 0.45, 0.33], [0, 0.45, 0])],
  Hay_Bale: [cuboid([0.5, 0.24, 0.3], [0, 0.24, 0])],
  Hay_Stack: [cuboid([0.56, 0.47, 0.62], [0, 0.47, 0])],
  Log_Pile: [cuboid([0.72, 0.4, 0.75], [0, 0.4, 0])],
  Cart: [cuboid([1.0, 0.5, 0.78], [0, 0.5, 0]), cuboid([0.75, 0.15, 0.4], [1.6, 0.25, 0])],
  // Comptoir et poteaux, enseigne à hauteur de tête, sac et citrouilles ; le lambrequin reste au-dessus des avatars
  Market_Stall: [
    cuboid([1.26, 0.64, 0.66], [0, 0.64, 0.02]),
    cuboid([0.42, 0.24, 0.05], [-1.68, 1.78, 0.55]),
    cylinder(0.3, 0.28, [-1.62, 0.3, -0.2]),
    cylinder(0.15, 0.2, [1.52, 0.15, 0.82]),
    cylinder(0.12, 0.16, [1.82, 0.12, 0.46]),
  ],
  Rock_Small: [cuboid([0.42, 0.24, 0.34], [0, 0.22, 0])],
  Rock_Medium: [cuboid([0.76, 0.36, 0.58], [0, 0.36, 0])],
  Rock_Large: [cuboid([1.25, 0.57, 0.94], [0, 0.58, 0])],
});

// Même variation procédurale que la maison (bruit triplanaire en espace monde) ;
// l'occlusion ambiante est déjà cuite dans les couleurs de sommets.
function applyDecorShading(material) {
  const uniforms = { uNoiseTexture: sharedUniforms.uNoiseTexture };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDecorWorld;
        varying vec3 vDecorNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vDecorWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vDecorNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoiseTexture;
        varying vec3 vDecorWorld;
        varying vec3 vDecorNormal;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 decorBlend = abs(normalize(vDecorNormal));
        decorBlend /= decorBlend.x + decorBlend.y + decorBlend.z;
        float decorNoise =
          texture2D(uNoiseTexture, vDecorWorld.zy * 0.3).g * decorBlend.x +
          texture2D(uNoiseTexture, vDecorWorld.xz * 0.3).g * decorBlend.y +
          texture2D(uNoiseTexture, vDecorWorld.xy * 0.3).g * decorBlend.z;
        float decorGrain =
          texture2D(uNoiseTexture, vDecorWorld.zy * 1.7).b * decorBlend.x +
          texture2D(uNoiseTexture, vDecorWorld.xz * 1.7).b * decorBlend.y +
          texture2D(uNoiseTexture, vDecorWorld.xy * 1.7).b * decorBlend.z;
        diffuseColor.rgb *= mix(0.86, 1.08, decorNoise) * mix(0.94, 1.04, decorGrain);`,
      );
  };
  material.customProgramCacheKey = () => `decor-${material.type}`;
}

function tuneMaterial(source) {
  const material = source.clone();

  if (material.name === 'MAT_Lantern_Glow') {
    material.color.set('#9b4a1c');
    material.emissive.set('#ffc07a');
    material.emissiveIntensity = 2.2;
  }

  if (material.name === 'MAT_Glass_Blue') {
    material.roughness = 0.08;
    material.metalness = 0.15;
    material.envMapIntensity = 1.4;
  }

  if (!UNSHADED_MATERIALS.has(material.name)) applyDecorShading(material);
  material.needsUpdate = true;
  return material;
}

function groundHeight(x, z, radius) {
  let height = calculateHeight(x, z);
  if (radius > 0) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      height = Math.min(height, calculateHeight(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius));
    }
  }
  return height;
}

function placementMatrix({ model, x, z, yaw = 0, scale = 1 }) {
  const { radius = 0.3, sink = 0.03 } = GROUNDING[model] ?? {};
  const y = groundHeight(x, z, radius * scale) - sink * scale;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw),
    new THREE.Vector3(scale, scale, scale),
  );
}

// Découpe chaque polyligne en travées posées sur le terrain (inclinées selon la pente)
function expandFences(fences) {
  const segments = [];
  const posts = [];
  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);

  fences.forEach((line) => {
    for (let i = 0; i < line.length - 1; i++) {
      const start = line[i];
      const end = line[i + 1];
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      const count = Math.max(1, Math.round(length / FENCE_SPAN));

      for (let k = 0; k < count; k++) {
        const x0 = start.x + ((end.x - start.x) * k) / count;
        const z0 = start.z + ((end.z - start.z) * k) / count;
        const x1 = start.x + ((end.x - start.x) * (k + 1)) / count;
        const z1 = start.z + ((end.z - start.z) * (k + 1)) / count;
        const y0 = calculateHeight(x0, z0) - 0.03;
        const y1 = calculateHeight(x1, z1) - 0.03;
        const span = Math.hypot(x1 - x0, z1 - z0);
        const yaw = Math.atan2(-(z1 - z0), x1 - x0);
        const pitch = Math.atan2(y1 - y0, span);
        const rotation = new THREE.Quaternion()
          .setFromAxisAngle(yAxis, yaw)
          .multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, pitch));
        const stretch = Math.hypot(span, y1 - y0) / FENCE_SPAN;

        segments.push({
          matrix: new THREE.Matrix4().compose(
            new THREE.Vector3(x0, y0, z0),
            rotation,
            new THREE.Vector3(stretch, 1, 1),
          ),
          collider: {
            kind: 'cuboid',
            args: [span / 2, 0.55, 0.08],
            position: [(x0 + x1) / 2, (y0 + y1) / 2 + 0.55, (z0 + z1) / 2],
            rotation: [0, yaw, 0],
          },
        });
      }
    }
    const last = line[line.length - 1];
    posts.push({ model: 'Fence_Post', x: last.x, z: last.z });
  });

  return { segments, posts };
}

// Le GLTFLoader peut suffixer le nom d'un nœud qui partage celui de son maillage :
// on cherche d'abord le nom d'origine conservé dans userData.
function findNode(scene, name) {
  let found = null;
  scene.traverse((object) => {
    if (!found && object.userData?.name === name) found = object;
  });
  return found ?? scene.getObjectByName(name);
}

// Maillages d'un nœud du glTF, regroupés par matériau, dans le repère du nœud
function collectParts(node, getMaterial) {
  const parts = new Map();
  const inverse = new THREE.Matrix4().copy(node.matrixWorld).invert();
  const meshes = node.isMesh ? [node] : node.children.filter((child) => child.isMesh);

  meshes.forEach((mesh) => {
    const material = getMaterial(mesh.material);
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(geometry);
  });

  return parts;
}

function mergeByMaterial(entries, name) {
  const group = new THREE.Group();
  group.name = name;
  const geometries = [];

  entries.forEach((sources, material) => {
    const geometry = mergeGeometries(sources, false);
    sources.forEach((source) => source.dispose());
    if (!geometry) {
      console.warn(`[Decor] Fusion impossible pour ${material.name}.`);
      return;
    }
    geometry.computeBoundingSphere();
    geometries.push(geometry);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}_${material.name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return { group, geometries };
}

function toWorldCollider(spec, matrix, scale = 1) {
  const position = new THREE.Vector3(...spec.offset).applyMatrix4(matrix);
  const orientation = new THREE.Quaternion();
  matrix.decompose(new THREE.Vector3(), orientation, new THREE.Vector3());
  if (spec.rotation) orientation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...spec.rotation)));
  const rotation = new THREE.Euler().setFromQuaternion(orientation);

  return {
    kind: spec.kind,
    args: spec.args.map((value) => value * scale),
    position: position.toArray(),
    rotation: [rotation.x, rotation.y, rotation.z],
  };
}

function prepareDecor(scene) {
  scene.updateMatrixWorld(true);
  const materials = new Map();
  const getMaterial = (source) => {
    if (!materials.has(source.uuid)) materials.set(source.uuid, tuneMaterial(source));
    return materials.get(source.uuid);
  };

  const prototypes = new Map();
  const getPrototype = (name) => {
    if (!prototypes.has(name)) {
      const node = findNode(scene, name);
      prototypes.set(name, node ? collectParts(node, getMaterial) : null);
    }
    return prototypes.get(name);
  };

  const staticParts = new Map();
  const colliders = [];
  const addInstance = (name, matrix, scale = 1) => {
    const parts = getPrototype(name);
    if (!parts) {
      console.warn(`[Decor] Modèle absent du glTF : ${name}`);
      return;
    }
    parts.forEach((geometries, material) => {
      if (!staticParts.has(material)) staticParts.set(material, []);
      geometries.forEach((geometry) => staticParts.get(material).push(geometry.clone().applyMatrix4(matrix)));
    });
    (PROP_COLLIDERS[name] ?? []).forEach((spec) => colliders.push(toWorldCollider(spec, matrix, scale)));
  };

  const windmillMatrix = placementMatrix({ model: 'Windmill', ...WINDMILL });
  addInstance('Windmill', windmillMatrix);
  addInstance('Well', placementMatrix({ model: 'Well', ...WELL }));

  const { segments, posts } = expandFences(DECOR_FENCES);
  segments.forEach((segment) => {
    addInstance('Fence_Segment', segment.matrix);
    colliders.push(segment.collider);
  });
  [...DECOR_PROPS, ...posts].forEach((placement) => {
    addInstance(placement.model, placementMatrix(placement), placement.scale ?? 1);
  });

  prototypes.forEach((parts) => parts?.forEach((geometries) => geometries.forEach((geometry) => geometry.dispose())));

  const { group, geometries } = mergeByMaterial(staticParts, 'Decor_Static');

  // Ailes du moulin : nœud animé, conservé sous son moyeu incliné
  const hubSource = findNode(scene, 'Windmill_Hub');
  const sailsSource = findNode(scene, 'Windmill_Sails');
  let sails = null;
  if (hubSource && sailsSource) {
    const hub = new THREE.Group();
    hub.name = 'Windmill_Hub';
    hub.matrixAutoUpdate = false;
    hub.matrix.multiplyMatrices(windmillMatrix, hubSource.matrix);
    const merged = mergeByMaterial(collectParts(sailsSource, getMaterial), 'Windmill_Sails');
    sails = merged.group;
    geometries.push(...merged.geometries);
    hub.add(sails);
    group.add(hub);
  }

  return {
    group,
    sails,
    colliders,
    geometries,
    materials: [...materials.values()],
  };
}

const Decor = memo(function Decor() {
  const { scene } = useGLTF(DECOR_URL);
  const prepared = useMemo(() => prepareDecor(scene), [scene]);
  const sailsRef = useRef(prepared.sails);

  useEffect(() => {
    sailsRef.current = prepared.sails;
    return () => {
      prepared.geometries.forEach((geometry) => geometry.dispose());
      prepared.materials.forEach((material) => material.dispose());
    };
  }, [prepared]);

  useFrame((_, delta) => {
    if (sailsRef.current) sailsRef.current.rotation.z += Math.min(delta, 0.1) * SAIL_SPEED;
  });

  return (
    <>
      <primitive object={prepared.group} />
      <RigidBody type="fixed" colliders={false}>
        {prepared.colliders.map((collider, index) => (
          collider.kind === 'cylinder' ? (
            <CylinderCollider
              key={index}
              args={collider.args}
              position={collider.position}
              rotation={collider.rotation}
              friction={0.85}
              restitution={0}
            />
          ) : (
            <CuboidCollider
              key={index}
              args={collider.args}
              position={collider.position}
              rotation={collider.rotation}
              friction={0.85}
              restitution={0}
            />
          )
        ))}
      </RigidBody>
    </>
  );
});

export default Decor;

useGLTF.preload(DECOR_URL);
