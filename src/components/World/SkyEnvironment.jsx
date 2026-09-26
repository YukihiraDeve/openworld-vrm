import { memo, useMemo } from 'react';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { ATMOSPHERE_GLSL } from './atmosphere';

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vDirection;
  ${ATMOSPHERE_GLSL}

  void main() {
    vec3 dir = normalize(vDirection);
    vec3 color = atmosphereColor(dir);
    float below = 1.0 - smoothstep(-0.12, 0.02, dir.y);
    color = mix(color, vec3(0.12, 0.16, 0.06), below);
    float sunAmount = max(dot(dir, ATMO_SUN_DIR), 0.0);
    color += vec3(1.0, 0.93, 0.8) * (pow(sunAmount, 400.0) * 10.0 + pow(sunAmount, 16.0) * 0.35);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Carte d'environnement générée une seule fois depuis le ciel : reflets et lumière ambiante
// pour les matériaux PBR (maison, métal, verre)
const SkyEnvironment = memo(function SkyEnvironment({ intensity = 0.75 }) {
  const material = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    }),
    [],
  );

  return (
    <Environment frames={1} resolution={128} environmentIntensity={intensity}>
      <mesh material={material} scale={100}>
        <sphereGeometry args={[1, 48, 24]} />
      </mesh>
    </Environment>
  );
});

export default SkyEnvironment;
