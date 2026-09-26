import { BlendFunction, Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

const fragmentShader = /* glsl */ `
  uniform float contrast;
  uniform float saturation;
  uniform float vibrance;
  uniform vec3 shadowTint;
  uniform vec3 highlightTint;
  uniform float vignetteStrength;

  float gradeHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 color = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));

    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color += shadowTint * (1.0 - smoothstep(0.0, 0.5, luma));
    color += highlightTint * smoothstep(0.5, 1.0, luma);

    color = (color - 0.5) * contrast + 0.5;

    luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float chroma = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
    color = mix(vec3(luma), color, saturation + vibrance * (1.0 - smoothstep(0.0, 0.6, chroma)));

    vec2 centered = (uv - 0.5) * vec2(1.0, 0.82);
    color *= 1.0 - smoothstep(0.32, 0.9, length(centered)) * vignetteStrength;

    color += (gradeHash(gl_FragCoord.xy) - 0.5) / 255.0;
    outputColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(2.2)), inputColor.a);
  }
`;

export class ColorGradeEffect extends Effect {
  constructor({
    contrast = 1.06,
    saturation = 1.06,
    vibrance = 0.12,
    shadowTint = new Vector3(-0.006, 0.0, 0.014),
    highlightTint = new Vector3(0.014, 0.008, -0.008),
    vignetteStrength = 0.28,
  } = {}) {
    super('ColorGradeEffect', fragmentShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['contrast', new Uniform(contrast)],
        ['saturation', new Uniform(saturation)],
        ['vibrance', new Uniform(vibrance)],
        ['shadowTint', new Uniform(shadowTint)],
        ['highlightTint', new Uniform(highlightTint)],
        ['vignetteStrength', new Uniform(vignetteStrength)],
      ]),
    });
  }
}
