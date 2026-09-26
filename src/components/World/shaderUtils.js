import * as THREE from 'three';

// Boucle d'éclairage standard qui mémorise aussi la lumière du soleil déjà atténuée par son ombre
// (capturedSunLight), pour ajouter de la translucidité sans refaire une lecture de shadow map.
export function lightsBeginWithSunCapture() {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const marker = 'getDirectionalLightInfo';
  const index = chunk.indexOf(marker);
  if (index === -1) return `vec3 capturedSunLight = vec3(0.0);\n${chunk}`;

  const head = chunk.slice(0, index);
  const tail = chunk
    .slice(index)
    .replace('RE_Direct(', 'capturedSunLight += directLight.color;\n\t\tRE_Direct(');
  return `vec3 capturedSunLight = vec3(0.0);\n${head}${tail}`;
}

// Normale non inversée sur les faces arrière : les brins d'herbe et les feuilles utilisent des
// normales « volumiques » qui doivent rester identiques des deux côtés.
export function normalBeginWithoutFlip() {
  return THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
}
