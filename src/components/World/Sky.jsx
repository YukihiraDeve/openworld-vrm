import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ATMOSPHERE_GLSL } from './atmosphere';
import { SKY_COLORS, WIND, sharedUniforms } from './environment';

const glslColor = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;
};

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
    gl_Position.z = gl_Position.w * 0.99999;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uNoiseTexture;
  varying vec3 vWorldPosition;

  #include <common>
  #include <dithering_pars_fragment>

  ${ATMOSPHERE_GLSL}

  const vec3 SUN_DISK = ${glslColor(SKY_COLORS.sunDisk)};
  const vec3 CLOUD_LIT = ${glslColor(SKY_COLORS.cloudLit)};
  const vec3 CLOUD_SHADE = ${glslColor(SKY_COLORS.cloudShade)};
  const vec3 MOUNTAIN_FAR = ${glslColor(SKY_COLORS.mountainFar)};
  const vec3 MOUNTAIN_NEAR = ${glslColor(SKY_COLORS.mountainNear)};
  const vec3 SNOW = ${glslColor(SKY_COLORS.snow)};
  const vec2 CLOUD_WIND = vec2(${WIND.direction.x.toFixed(4)}, ${WIND.direction.y.toFixed(4)});

  float cloudField(vec2 p) {
    float base = texture2D(uNoiseTexture, p * 0.21).r;
    float billow = texture2D(uNoiseTexture, p * 0.57 + vec2(0.37, 0.11)).g;
    float detail = texture2D(uNoiseTexture, p * 1.63 + vec2(0.71, 0.29)).a;
    return base * 0.6 + billow * 0.3 + detail * 0.13;
  }

  float ridgeHeight(vec2 circle, float scale, vec2 offset, float sharpness) {
    float broad = texture2D(uNoiseTexture, circle * scale + offset).r;
    float ridge = 1.0 - abs(texture2D(uNoiseTexture, circle * scale * 2.4 + offset * 1.7).b * 2.0 - 1.0);
    return pow(clamp(broad * 0.72 + ridge * 0.34, 0.0, 1.0), sharpness);
  }

  vec3 applyMountains(vec3 color, vec3 dir) {
    vec2 circle = normalize(dir.xz + vec2(1e-5));

    float farRidge = 0.012 + 0.105 * ridgeHeight(circle, 0.42, vec2(0.21, 0.67), 1.9);
    float farEdge = farRidge - dir.y;
    float farAA = fwidth(dir.y) * 1.5;
    if (farEdge > -farAA) {
      float depth = clamp(farEdge / max(farRidge, 1e-3), 0.0, 1.0);
      float snowLine = smoothstep(0.07, 0.1, farRidge) * (1.0 - smoothstep(0.004, 0.022, farEdge));
      vec3 rock = mix(MOUNTAIN_FAR * 1.08, MOUNTAIN_FAR * 0.86, smoothstep(0.0, 0.6, depth));
      vec3 mountain = mix(rock, SNOW, snowLine * 0.85);
      mountain = mix(mountain, atmosphereColor(dir), 0.38 + 0.42 * smoothstep(0.1, 1.0, depth));
      color = mix(color, mountain, smoothstep(-farAA, farAA, farEdge));
    }

    float nearRidge = 0.004 + 0.052 * ridgeHeight(circle, 0.78, vec2(0.63, 0.12), 1.35);
    float nearEdge = nearRidge - dir.y;
    float nearAA = fwidth(dir.y) * 1.5;
    if (nearEdge > -nearAA) {
      float depth = clamp(nearEdge / max(nearRidge, 1e-3), 0.0, 1.0);
      vec3 hills = mix(MOUNTAIN_NEAR * 1.05, MOUNTAIN_NEAR * 0.8, depth);
      hills = mix(hills, atmosphereColor(dir), 0.3 + 0.35 * depth);
      color = mix(color, hills, smoothstep(-nearAA, nearAA, nearEdge));
    }
    return color;
  }

  vec3 applyClouds(vec3 color, vec3 dir, float sunAmount) {
    if (dir.y <= 0.0) return color;

    vec2 uv = dir.xz / (dir.y + 0.16);
    vec2 p = uv * 0.55 + CLOUD_WIND * uTime * 0.0035;
    float field = cloudField(p);
    float coverage = 0.5;
    float density = smoothstep(coverage, coverage + 0.13, field);
    if (density <= 0.0) return color;

    vec2 toSun = normalize(ATMO_SUN_DIR.xz) * 0.085;
    float fieldTowardSun = cloudField(p + toSun);
    float light = clamp(0.64 + (field - fieldTowardSun) * 5.5, 0.0, 1.0);
    vec3 cloud = mix(CLOUD_SHADE, CLOUD_LIT * 1.08, light);
    cloud *= mix(1.0, 0.9, smoothstep(coverage + 0.12, coverage + 0.34, field));
    cloud += SUN_DISK * pow(sunAmount, 9.0) * (1.0 - density * 0.7) * 0.9;

    float horizon = smoothstep(0.0, 0.3, dir.y);
    cloud = mix(atmosphereColor(dir), cloud, 0.4 + 0.6 * horizon);
    return mix(color, cloud, density * smoothstep(0.012, 0.09, dir.y));
  }

  void main() {
    vec3 dir = normalize(vWorldPosition - cameraPosition);
    float sunDot = dot(dir, ATMO_SUN_DIR);
    float sunAmount = max(sunDot, 0.0);

    vec3 color = atmosphereColor(dir);
    color += SUN_DISK * pow(sunAmount, 600.0) * 1.4;
    color += SUN_DISK * smoothstep(0.99962, 0.99984, sunDot) * 24.0;

    color = applyClouds(color, dir, sunAmount);
    color = applyMountains(color, dir);

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

const SkyDome = memo(function SkyDome() {
  const meshRef = useRef();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: sharedUniforms.uTime,
          uNoiseTexture: sharedUniforms.uNoiseTexture,
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        dithering: true,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera }) => {
    meshRef.current?.position.copy(camera.position);
  });

  return (
    <mesh ref={meshRef} material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[900, 48, 24]} />
    </mesh>
  );
});

export default SkyDome;
