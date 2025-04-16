import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = `
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform vec3 uSunPosition;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uExponent;
uniform vec3 uCloudColor;
uniform float uCloudScale;
uniform float uCloudCoverage;
uniform float uCloudSpeed;
uniform float uTime;

varying vec3 vWorldPosition;
varying vec2 vUv;

// --- Fonctions de Bruit et FBM (Simplifiées) ---
// Fonction de hachage pseudo-aléatoire 2D -> 1D
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Bruit simple (Value Noise)
float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Quatre coins de la cellule
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    // Interpolation douce (Smoothstep)
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Fractional Brownian Motion (FBM)
float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 0.0;
    // Ajoutez des couches (octaves) de bruit
    for (int i = 0; i < 4; i++) { // 4 Octaves
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}
// --- Fin des fonctions de Bruit ---

void main() {
  vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
  float skyFactor = pow(max(0.0, dot(normalize(vWorldPosition), vec3(0, 1, 0))), uExponent);
  vec3 skyColor = mix(uBottomColor, uTopColor, skyFactor);

  // Soleil
  float sunDot = dot(viewDirection, normalize(uSunPosition));
  float sunIntensity = smoothstep(0.995, 0.997, sunDot);
  vec3 sunColor = vec3(1.0, 1.0, 0.8);
  vec3 finalColor = mix(skyColor, sunColor, sunIntensity);

  // Nuages - Utilisation de vUv
  vec2 cloudUv = vUv;

  // Déplacer les coordonnées UV pour l'animation (principalement horizontalement)
  cloudUv.x += uTime * uCloudSpeed;

  // Appliquer l'échelle aux coordonnées UV
  // Vous pourriez vouloir une échelle différente pour u et v pour étirer les nuages
  // exemple: vec2 scaledUv = cloudUv * vec2(uCloudScale * 2.0, uCloudScale * 0.5);
  vec2 scaledUv = cloudUv * uCloudScale;

  // Calculer le bruit FBM avec les UV mis à l'échelle
  float cloudNoise = fbm(scaledUv);

  // Appliquer la couverture et adoucir les bords
  float cloudPresence = smoothstep(1.0 - uCloudCoverage, 1.0, cloudNoise);

  // Optionnel: Moduler la présence par la hauteur (moins de nuages au zénith)
  // float cloudHeightFactor = smoothstep(0.1, 0.5, 1.0 - vUv.y); // Utilise vUv.y pour la hauteur
  // cloudPresence *= cloudHeightFactor;

  // Mélanger la couleur du ciel/soleil avec la couleur des nuages
  finalColor = mix(finalColor, uCloudColor, cloudPresence * 0.8); // Ajuster l'opacité des nuages ici


  gl_FragColor = vec4(finalColor, 1.0);
}
`;

const Sky = ({ sunPosition }) => {
  const materialRef = useRef();

  const uniforms = {
    uSunPosition: { value: new THREE.Vector3() },
    uTopColor: { value: new THREE.Color(0x0077ff) },
    uBottomColor: { value: new THREE.Color(0xffffff) },
    uExponent: { value: 0.6 },
    // Nouveaux uniforms pour les nuages
    uCloudColor: { value: new THREE.Color(0xffffff) }, // Couleur des nuages (blanc)
    uCloudScale: { value: 5.0 }, // Échelle des motifs de nuages
    uCloudCoverage: { value: 0.4 }, // Couverture nuageuse (0 à 1)
    uCloudSpeed: { value: 0.02 }, // Vitesse d'animation des nuages
    uTime: { value: 0.0 } // Temps pour l'animation
  };

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uSunPosition.value.copy(sunPosition);
    }
  }, [sunPosition]);

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh scale={[1000, 1000, 1000]}>
      <sphereGeometry args={[1, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
      />
    </mesh>
  );
};

export default Sky;
