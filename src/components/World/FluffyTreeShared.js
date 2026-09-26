export const TREE_MODEL_PATH = '/assets/models/arbre.glb';

const CANOPY_FILTERS = ['nova_copa', 'leaf', 'feuille', 'foliage', 'leaves'];
const TRUNK_FILTERS = ['trunk', 'tronc', 'bark', 'stem'];

export const isCanopy = (name) => CANOPY_FILTERS.some((filter) => name.toLowerCase().includes(filter));

export const isTrunk = (name) => TRUNK_FILTERS.some((filter) => name.toLowerCase().includes(filter));

export function findLeafTexture(scene) {
  let texture = null;
  scene.traverse((object) => {
    if (!texture && object.isMesh && isCanopy(object.name)) texture = object.material.map;
  });
  return texture;
}
