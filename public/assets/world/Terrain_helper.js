// Code d'aide pour charger ce terrain dans ThreeJS
function loadTerrain(scene) {
  // Charger les textures et matériaux
  const mtlLoader = new THREE.MTLLoader();
  mtlLoader.load('Terrain.mtl', (materials) => {
    materials.preload();
    
    // Configurer les textures pour éviter le zoom excessif
    Object.values(materials.materials).forEach(material => {
      if (material.map) {
        // Empêcher la répétition des textures (évite le zoom excessif)
        material.map.wrapS = THREE.ClampToEdgeWrapping;
        material.map.wrapT = THREE.ClampToEdgeWrapping;
        
        // Éviter le filtrage mipmapping qui peut causer un zoom excessif
        material.map.minFilter = THREE.LinearFilter;
        material.map.magFilter = THREE.LinearFilter;
        
        // Définir l'espace colorimétrique de la texture
        material.map.encoding = THREE.sRGBEncoding;
      }
    });
    
    // Charger l'objet 3D
    const objLoader = new THREE.OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load('Terrain.obj', (object) => {
      // Ajouter l'objet à la scène
      scene.add(object);
      
      // Exemple: ajuster la position de la caméra pour voir tout le terrain
      // Si vous utilisez OrbitControls:
      // controls.target.set(0, 0, 0);
      // camera.position.set(0, 50, 100);
      // controls.update();
    });
  });
}

/* Exemple complet d'utilisation:
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

// Créer la scène, la caméra et le renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

// Ajouter des contrôles pour orbiter autour du terrain
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;

// Ajouter un éclairage
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(0, 10, 10);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// Charger le terrain
loadTerrain(scene);

// Positionner la caméra
camera.position.set(0, 50, 100);
controls.update();

// Boucle de rendu
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
*/
