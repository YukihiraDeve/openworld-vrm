import { forwardRef, useMemo } from 'react';
import { useFrame, useThree, useLoader } from '@react-three/fiber';
import { Effect, BlendFunction } from 'postprocessing';
import * as THREE from 'three';

/**
 * Screen-space lens flare — runs as a post-processing effect.
 *
 * Occlusion is handled naturally: the shader samples the rendered scene
 * at the sun's screen position.  If the pixel is bright (sun visible)
 * the flare shows; if it's dark (tree/object in front) the flare fades.
 *
 * Uses the starburst and bokeh textures from /assets/textures/sun/.
 */

const fragmentShader = /* glsl */ `
uniform vec2 uSunScreenPos;
uniform float uIntensity;
uniform sampler2D uFlareStarburst;
uniform sampler2D uFlareBokeh;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = inputColor;

  vec2 sp = uSunScreenPos;

  // Sun off-screen — skip entirely
  if (sp.x < -0.3 || sp.x > 1.3 || sp.y < -0.3 || sp.y > 1.3) return;

  // ── Visibility: sample scene luminance at the sun's pixel ──
  vec2 sampleUV = clamp(sp, vec2(0.002), vec2(0.998));
  vec4 sceneSample = texture2D(inputBuffer, sampleUV);
  float lum = max(sceneSample.r, max(sceneSample.g, sceneSample.b));
  float vis = smoothstep(0.5, 2.5, lum) * uIntensity;
  if (vis < 0.005) return;

  // Fade near screen edges so the flare doesn't pop
  float edgeX = min(sp.x, 1.0 - sp.x);
  float edgeY = min(sp.y, 1.0 - sp.y);
  vis *= smoothstep(0.0, 0.12, min(edgeX, edgeY));

  float ar = resolution.x / resolution.y;
  vec2 toCenter = vec2(0.5) - sp;

  // ── Main starburst centred on the sun ──
  vec2 d0 = uv - sp;
  d0.x *= ar;
  vec2 uv0 = d0 / 0.45 + 0.5;
  if (uv0.x > 0.0 && uv0.x < 1.0 && uv0.y > 0.0 && uv0.y < 1.0) {
    float fade = 1.0 - smoothstep(0.35, 0.5, length(uv0 - 0.5));
    vec3 f = texture2D(uFlareStarburst, uv0).rgb;
    outputColor.rgb += f * vis * 0.7 * fade;
  }

  // ── Ghost bokeh circles along the sun → screen-centre axis ──
  for (int i = 0; i < 7; i++) {
    float fi  = float(i);
    float t   = 0.15 + fi * 0.13;
    float sz  = 0.03 + fi * 0.012;
    float str = 0.22 * (1.0 - t * 0.65);

    vec2 gp = sp + toCenter * t;
    vec2 dg = uv - gp;
    dg.x *= ar;
    vec2 uvg = dg / sz + 0.5;
    if (uvg.x > 0.0 && uvg.x < 1.0 && uvg.y > 0.0 && uvg.y < 1.0) {
      vec3 g = texture2D(uFlareBokeh, uvg).rgb;
      outputColor.rgb += g * vis * max(str, 0.03);
    }
  }

  // ── Opposite-side ghost (reflection past centre) ──
  vec2 mirrorPos = sp + toCenter * 1.3;
  vec2 dm = uv - mirrorPos;
  dm.x *= ar;
  vec2 uvm = dm / 0.08 + 0.5;
  if (uvm.x > 0.0 && uvm.x < 1.0 && uvm.y > 0.0 && uvm.y < 1.0) {
    vec3 m = texture2D(uFlareBokeh, uvm).rgb;
    outputColor.rgb += m * vis * 0.15;
  }
}
`;

// ── PostProcessing Effect class ──────────────────────────────────────
class ScreenLensFlareEffect extends Effect {
  constructor({ starburstTex, bokehTex, intensity }) {
    super('ScreenLensFlare', fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['uSunScreenPos', new THREE.Uniform(new THREE.Vector2(-999, -999))],
        ['uIntensity', new THREE.Uniform(intensity)],
        ['uFlareStarburst', new THREE.Uniform(starburstTex)],
        ['uFlareBokeh', new THREE.Uniform(bokehTex)],
      ]),
    });
  }
}

// ── React wrapper ────────────────────────────────────────────────────
const LensFlare = forwardRef(function LensFlare(
  { sunPosition = [0, 10, -10], intensity = 0.6 },
  ref,
) {
  const starburstTex = useLoader(
    THREE.TextureLoader,
    '/assets/textures/sun/lensflare0.png',
  );
  const bokehTex = useLoader(
    THREE.TextureLoader,
    '/assets/textures/sun/lensflare3.png',
  );

  const effect = useMemo(
    () => new ScreenLensFlareEffect({ starburstTex, bokehTex, intensity }),
    [starburstTex, bokehTex, intensity],
  );

  const { camera } = useThree();
  const _v = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    _v.fromArray(sunPosition).normalize().multiplyScalar(400);
    _v.project(camera);

    const behind = _v.z > 1;
    effect.uniforms.get('uSunScreenPos').value.set(
      behind ? -999 : (_v.x + 1) * 0.5,
      behind ? -999 : (_v.y + 1) * 0.5,
    );
  });

  return <primitive ref={ref} object={effect} dispose={null} />;
});

LensFlare.displayName = 'LensFlare';
export default LensFlare;
