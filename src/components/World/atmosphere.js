import * as THREE from 'three';
import { FOG, SKY_COLORS, SUN_DIRECTION } from './environment';

const glslVec3 = (value) => {
  const v = value.isColor ? [value.r, value.g, value.b] : [value.x, value.y, value.z];
  return `vec3(${v.map((n) => n.toFixed(5)).join(', ')})`;
};
const glslFloat = (value) => value.toFixed(6);
const color = (hex) => new THREE.Color(hex);

// Couleur du ciel sans soleil ni nuages : partagée par le dôme céleste et le brouillard
// pour que le décor lointain se fonde exactement dans l'horizon.
export const ATMOSPHERE_GLSL = /* glsl */ `
const vec3 ATMO_SUN_DIR = ${glslVec3(SUN_DIRECTION)};
const vec3 ATMO_ZENITH = ${glslVec3(color(SKY_COLORS.zenith))};
const vec3 ATMO_SKY = ${glslVec3(color(SKY_COLORS.sky))};
const vec3 ATMO_HORIZON = ${glslVec3(color(SKY_COLORS.horizon))};
const vec3 ATMO_SUN_HAZE = ${glslVec3(color(SKY_COLORS.sunHaze))};
const vec3 ATMO_GROUND_HAZE = ${glslVec3(color(SKY_COLORS.groundHaze))};
const float ATMO_FOG_FALLOFF = ${glslFloat(FOG.heightFalloff)};
const float ATMO_FOG_BASE = ${glslFloat(FOG.baseHeight)};

vec3 atmosphereColor( vec3 dir ) {
  float sunAmount = max( dot( dir, ATMO_SUN_DIR ), 0.0 );
  float y = dir.y;
  vec3 sky = mix( ATMO_SKY, ATMO_ZENITH, smoothstep( 0.05, 0.8, y ) );
  vec3 horizon = mix( ATMO_HORIZON, ATMO_SUN_HAZE, pow( sunAmount, 5.0 ) * 0.8 );
  vec3 result = mix( horizon, sky, pow( smoothstep( -0.03, 0.5, y ), 0.8 ) );
  result = mix( result, ATMO_GROUND_HAZE, 1.0 - smoothstep( -0.3, -0.02, y ) );
  result += ATMO_SUN_HAZE * pow( sunAmount, 40.0 ) * 0.5;
  return result;
}

float atmosphereFogFactor( vec3 origin, vec3 dir, float dist, float density ) {
  float k = ATMO_FOG_FALLOFF * dir.y;
  float integral = abs( k ) > 1e-5 ? ( 1.0 - exp( -dist * k ) ) / k : dist;
  float amount = density * exp( -ATMO_FOG_FALLOFF * ( origin.y - ATMO_FOG_BASE ) ) * integral;
  return 1.0 - exp( -max( amount, 0.0 ) );
}
`;

let installed = false;

// Remplace le brouillard de three.js par un brouillard de hauteur dont la couleur suit le ciel
// (plus chaud du côté du soleil). S'applique à tous les matériaux, y compris MToon des VRM.
export function installAtmosphere() {
  if (installed) return;
  installed = true;

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorldVector;
#endif
`;

  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogWorldVector = mvPosition.xyz * mat3( viewMatrix );
#endif
`;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogWorldVector;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${ATMOSPHERE_GLSL}
#endif
`;

  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogDistance = length( vFogWorldVector );
  vec3 fogDirection = vFogWorldVector / max( fogDistance, 1e-4 );
  #ifdef FOG_EXP2
    float fogFactor = atmosphereFogFactor( cameraPosition, fogDirection, fogDistance, fogDensity );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, fogDistance );
  #endif
  vec3 fogTint = atmosphereColor( fogDirection );
  #ifdef TONE_MAPPING
    fogTint = toneMapping( fogTint );
  #endif
  fogTint = linearToOutputTexel( vec4( fogTint, 1.0 ) ).rgb;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );
#endif
`;
}
