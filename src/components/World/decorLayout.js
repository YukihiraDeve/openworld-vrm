// Décor modélisé dans Blender (public/assets/models/decor/decor.glb).
// Coordonnées monde (x, z) ; yaw autour de Y, l'avant des modèles étant +Z.
// Module sans dépendance : il est lu par worldConfig, Paths et vegetationLayout.
export const DECOR_URL = '/assets/models/decor/decor.glb';

const toRadians = (degrees) => (degrees * Math.PI) / 180;

export const WINDMILL = Object.freeze({ x: -16, z: -32, yaw: toRadians(70) });
export const WELL = Object.freeze({ x: 4.5, z: -8.5, yaw: 0 });
// Au sud de la route principale, comptoir tourné vers la chaussée et la maison
export const MARKET_STALL = Object.freeze({ x: 16.2, z: 5.6, yaw: -3.03 });

// Position exprimée dans le repère d'un bâtiment (x à droite, z vers sa façade)
function around(anchor, x, z, yaw = 0) {
  const cos = Math.cos(anchor.yaw);
  const sin = Math.sin(anchor.yaw);
  return {
    x: anchor.x + x * cos + z * sin,
    z: anchor.z - x * sin + z * cos,
    yaw: anchor.yaw + yaw,
  };
}

const at = (x, z, yaw = 0) => ({ x, z, yaw });
const prop = (model, placement, extra = {}) => Object.freeze({ model, ...placement, ...extra });

// Le long des routes, lanterne tournée vers la chaussée
const LAMP_POSTS = [
  prop('Lamp_Post', at(-41.63, -16.61, -0.072)),
  prop('Lamp_Post', at(-26.29, -14.37, -0.262)),
  prop('Lamp_Post', at(-15.84, -10.56, toRadians(75))),
  prop('Lamp_Post', at(-1.87, -5.5, -0.343)),
  prop('Lamp_Post', at(13.39, 3.01, -3.062)),
  prop('Lamp_Post', at(26.59, 1.02, -2.948)),
  prop('Lamp_Post', at(43.33, -8.9, 0.217)),
  prop('Lamp_Post', at(-4.27, 5.43, -1.168)),
  prop('Lamp_Post', at(3.21, 17.47, -0.927)),
  prop('Lamp_Post', at(12.65, 28.99, -0.844)),
];

const ROCKS = [
  prop('Rock_Large', at(-27.5, 5.5, 0.4)),
  prop('Rock_Small', at(-25.7, 6.8, 1.9)),
  prop('Rock_Medium', at(-37, -21, 2.2)),
  prop('Rock_Large', at(24, 22, 2.8), { scale: 0.9 }),
  prop('Rock_Medium', at(26.3, 23.6, 0.7)),
  prop('Rock_Small', at(22.6, 24.2, 4.1)),
  prop('Rock_Medium', at(38.5, -22.5, 5.1), { scale: 0.85 }),
  prop('Rock_Medium', at(-9, 23, 3.3)),
  prop('Rock_Small', at(-7.5, 24.3, 0.2)),
  prop('Rock_Large', at(6, 40, 1.2), { scale: 1.15 }),
  prop('Rock_Medium', at(-41, 36, 4.4)),
  prop('Rock_Small', at(43, 41, 2.5)),
  prop('Rock_Medium', at(41.4, 42.6, 5.7), { scale: 0.8 }),
  prop('Rock_Large', at(-44, -4, 3.6), { scale: 1.1 }),
  prop('Rock_Medium', at(-22, -25.5, 1.5), { scale: 0.75 }),
  prop('Rock_Small', at(-20.8, -24.2, 3.9)),
  prop('Rock_Small', at(-11.7, -0.5, 0.8), { scale: 0.7 }),
];

export const DECOR_PROPS = Object.freeze([
  prop('Signpost', at(-12.8, -1.8)),

  // Cour du moulin : grain, foin et charrette de livraison
  prop('Sack_Pile', around(WINDMILL, -2.2, 3.3, 0.35)),
  prop('Grain_Sack', around(WINDMILL, -1.45, 4.35, -0.5)),
  prop('Grain_Sack', around(WINDMILL, 1.75, 3.95, 0.9)),
  prop('Barrel', around(WINDMILL, 2.6, 3.0, 0.3)),
  prop('Crate', around(WINDMILL, 3.2, 3.9, 0.45)),
  prop('Cart', around(WINDMILL, 4.9, 1.2, toRadians(-40))),
  prop('Hay_Stack', around(WINDMILL, -4.5, 0.6, toRadians(18))),
  prop('Hay_Bale', around(WINDMILL, -3.8, 2.7, toRadians(-28))),

  // Abords du puits et de la maison
  prop('Bench', at(1.35, -8.1, toRadians(12))),
  prop('Log_Pile', at(9.05, -12.2, toRadians(90))),
  prop('Barrel', at(9.2, -9.55, 1.3)),
  prop('Barrel', at(8.6, -8.95, 2.6), { scale: 0.92 }),
  prop('Crate', at(9.3, -14.55, 0.15)),

  // Étal de marché et sa réserve
  prop('Market_Stall', MARKET_STALL),
  prop('Barrel', around(MARKET_STALL, 2.3, -0.3, 0.8)),
  prop('Crate', around(MARKET_STALL, -2.4, -0.75, 0.3)),

  ...LAMP_POSTS,
  ...ROCKS,
]);

// Clôtures : chaque polyligne est découpée en travées d'environ 2,2 m
export const DECOR_FENCES = Object.freeze([
  Object.freeze([
    around(WINDMILL, -5.2, 3.2),
    around(WINDMILL, -6.4, -0.6),
    around(WINDMILL, -5.3, -4.6),
    around(WINDMILL, -1.8, -6.9),
    around(WINDMILL, 2.4, -6.6),
  ]),
]);

// Sentiers de terre ajoutés au réseau de chemins (herbe coupée, arbres écartés)
export const DECOR_FOOTPATHS = Object.freeze([
  Object.freeze({
    width: 1.7,
    points: Object.freeze([
      at(-14.2, -6.8),
      at(-13.4, -11),
      at(-11.8, -17.5),
      at(-10.6, -25),
      around(WINDMILL, 0, 4.7),
    ]),
  }),
  Object.freeze({
    width: 1.35,
    points: Object.freeze([
      at(4.0, -2.2),
      at(4.3, -5.4),
      around(WELL, 0, 1.6),
    ]),
  }),
]);

// Placettes de terre battue peintes dans le masque des chemins
export const DECOR_CLEARINGS = Object.freeze([
  Object.freeze({ x: WINDMILL.x, z: WINDMILL.z, radius: 5.2 }),
  Object.freeze({ ...around(WINDMILL, 0.4, 5.2), radius: 2.4 }),
  Object.freeze({ x: WELL.x, z: WELL.z, radius: 2.3 }),
  Object.freeze({ x: -12.8, z: -1.8, radius: 0.9 }),
  // Terre battue sous l'étal et devant le comptoir, jusqu'au bord de la route
  Object.freeze({ ...around(MARKET_STALL, 0, 1.4), radius: 2.8 }),
  Object.freeze({ ...around(MARKET_STALL, 0, -0.4), radius: 2.4 }),
]);

const zone = (x, z, halfX, halfZ = halfX, feather = 0.4) => Object.freeze({
  center: Object.freeze([x, z]),
  halfSize: Object.freeze([halfX, halfZ]),
  feather,
});

// Demi-emprise au sol des modèles posés dans l'herbe, puis largeur du fondu où elle raccourcit
const GRASS_FOOTPRINT = Object.freeze({
  Rock_Small: [0.4, 0.6],
  Rock_Medium: [0.7, 0.8],
  Rock_Large: [1.1, 1.0],
  Cart: [1.15, 0.4],
  Hay_Stack: [0.7, 0.4],
  Hay_Bale: [0.5, 0.35],
  Bench: [0.7, 0.35],
  Log_Pile: [0.8, 0.3],
});

// Zones sans herbe ni fleurs (sous les bâtiments, les rochers et le matériel)
export const DECOR_GRASS_ZONES = Object.freeze([
  zone(WINDMILL.x, WINDMILL.z, 3.3, 3.3, 0.6),
  zone(WELL.x, WELL.z, 1.15, 1.15, 0.4),
  ...DECOR_PROPS.filter((item) => GRASS_FOOTPRINT[item.model]).map((item) => {
    const [half, feather] = GRASS_FOOTPRINT[item.model];
    const size = half * (item.scale ?? 1);
    return zone(item.x, item.z, size, size, feather);
  }),
]);

// Zones que les arbres évitent (en plus des zones sans herbe), marge ajoutée par le placement
export const DECOR_TREE_ZONES = Object.freeze([
  zone(WINDMILL.x, WINDMILL.z, 6.5, 6.5),
  zone(WELL.x, WELL.z, 2.4, 2.4),
  zone(MARKET_STALL.x, MARKET_STALL.z, 2.7, 1.6),
  zone(-12.8, -1.8, 1, 1),
  ...LAMP_POSTS.map((lamp) => zone(lamp.x, lamp.z, 0.6, 0.6)),
  // Trouées qui gardent le moulin visible depuis le départ et depuis la prairie à l'est
  zone(-6, -8, 0.8, 0.8),
  zone(-7.5, -16, 0.8, 0.8),
  zone(-2, -11.5, 0.5, 0.5),
  zone(-6, -32, 0.8, 0.8),
]);
