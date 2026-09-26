import { useEffect, useMemo, useRef } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getPathInstances } from '../World/Paths';
import { calculateHeight } from '../World/terrain';
import { sharedUniforms } from '../World/environment';

const MAX_PARTICLES = 220;
const RUN_STEP_INTERVAL = 0.27;
const WALK_STEP_INTERVAL = 0.5;

const KIND_PUFF = 0;
const KIND_BIT = 1;

const DUST_COLOR = new THREE.Color('#c4a47c').multiplyScalar(2.2);
const DUST_DARK_COLOR = new THREE.Color('#9c7d58').multiplyScalar(2.2);
const GRASS_DUST_COLOR = new THREE.Color('#b9b98a').multiplyScalar(2.0);
const GRASS_BIT_COLORS = ['#6f9a38', '#8db048', '#5b8a31'].map((hex) => new THREE.Color(hex).multiplyScalar(1.9));

const vertexShader = /* glsl */ `
  uniform float uPointScale;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aKind;
  attribute float aSeed;
  attribute vec3 aColor;
  varying float vAlpha;
  varying float vKind;
  varying float vSeed;
  varying vec3 vColor;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aSize * uPointScale / max(-mvPosition.z, 0.3), 1.0, 320.0);
    vAlpha = aAlpha;
    vKind = aKind;
    vSeed = aSeed;
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTexture;
  varying float vAlpha;
  varying float vKind;
  varying float vSeed;
  varying vec3 vColor;

  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    float alpha;
    vec3 color = vColor;

    if (vKind < 0.5) {
      float n = texture2D(uNoiseTexture, gl_PointCoord * 0.3 + vec2(vSeed, vSeed * 1.7)).g;
      float n2 = texture2D(uNoiseTexture, gl_PointCoord * 0.6 + vec2(vSeed * 2.3, vSeed)).b;
      float edge = 0.25 + (n * 0.7 + n2 * 0.3) * 0.55;
      alpha = (1.0 - smoothstep(edge, 1.0, r)) * (0.65 + 0.35 * n2);
      color *= 0.78 + 0.32 * (0.5 - p.y * 0.5) + 0.1 * n;
    } else {
      alpha = 1.0 - smoothstep(0.55, 0.9, r);
      color *= 0.85 + 0.2 * (0.5 - p.y * 0.5);
    }

    alpha *= vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createParticleState() {
  return Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    kind: KIND_PUFF,
    life: 0,
    maxLife: 1,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    size: 0,
    growth: 0,
    opacity: 0,
    groundY: 0,
  }));
}

export default function DirtRunParticles({ targetRef, locomotion, movementDirection, paths }) {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const pathObjects = useMemo(() => getPathInstances(paths), [paths]);
  const particles = useMemo(() => createParticleState(), []);
  const cursorRef = useRef(0);
  const stepTimerRef = useRef(0);
  const footRef = useRef(1);
  const lastPositionRef = useRef(null);
  const airTimeRef = useRef(0);
  const fallSpeedRef = useRef(0);
  const temp = useMemo(
    () => ({
      position: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      side: new THREE.Vector3(),
      bufferSize: new THREE.Vector2(),
      color: new THREE.Color(),
    }),
    [],
  );

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES).map(() => Math.random()), 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    ['position', 'aSize', 'aAlpha', 'aColor', 'aKind'].forEach((name) => {
      geo.attributes[name].setUsage(THREE.DynamicDrawUsage);
    });
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return geo;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPointScale: { value: 400 },
          uNoiseTexture: sharedUniforms.uNoiseTexture,
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const isOnPath = (x, z) => pathObjects.some((path) => path.isOnPath(x, z, 0.6));

  const emit = (kind, origin, velocity, { size, growth, life, opacity, color }) => {
    const particle = particles[cursorRef.current];
    cursorRef.current = (cursorRef.current + 1) % MAX_PARTICLES;
    particle.active = true;
    particle.kind = kind;
    particle.life = 0;
    particle.maxLife = life;
    particle.position.copy(origin);
    particle.velocity.copy(velocity);
    particle.size = size;
    particle.growth = growth;
    particle.opacity = opacity;
    particle.groundY = origin.y - 0.05;
    particle.color = color;
  };

  const spawnFootstep = (center, forward, intensity, onPath) => {
    const { position, side } = temp;
    side.set(forward.z, 0, -forward.x);
    footRef.current *= -1;
    const groundY = calculateHeight(center.x, center.z);
    const velocity = new THREE.Vector3();

    const puffs = onPath ? Math.round(3 + intensity * 3) : Math.round(1 + intensity * 1.5);
    for (let i = 0; i < puffs; i++) {
      position
        .copy(center)
        .addScaledVector(side, footRef.current * 0.12 + (Math.random() - 0.5) * 0.2)
        .addScaledVector(forward, -0.1 - Math.random() * 0.25);
      position.y = groundY + 0.06 + Math.random() * 0.08;
      velocity
        .copy(forward)
        .multiplyScalar(-(0.4 + Math.random() * 0.9) * intensity)
        .addScaledVector(side, (Math.random() - 0.5) * 0.8);
      velocity.y = 0.25 + Math.random() * 0.5 * intensity;
      emit(KIND_PUFF, position, velocity, {
        size: 0.16 + Math.random() * 0.12,
        growth: 0.55 + Math.random() * 0.45,
        life: 0.7 + Math.random() * 0.6,
        opacity: (onPath ? 0.5 : 0.18) * (0.6 + intensity * 0.4),
        color: onPath ? (Math.random() < 0.35 ? DUST_DARK_COLOR : DUST_COLOR) : GRASS_DUST_COLOR,
      });
    }

    if (!onPath && intensity > 0.6) {
      const bits = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < bits; i++) {
        position.copy(center).addScaledVector(side, (Math.random() - 0.5) * 0.35);
        position.y = groundY + 0.15;
        velocity
          .copy(forward)
          .multiplyScalar(-(0.6 + Math.random() * 1.2))
          .addScaledVector(side, (Math.random() - 0.5) * 1.2);
        velocity.y = 1.4 + Math.random() * 1.3;
        emit(KIND_BIT, position, velocity, {
          size: 0.035 + Math.random() * 0.025,
          growth: 0,
          life: 0.55 + Math.random() * 0.35,
          opacity: 0.95,
          color: GRASS_BIT_COLORS[Math.floor(Math.random() * GRASS_BIT_COLORS.length)],
        });
      }
    }
  };

  const spawnLanding = (center, strength, onPath) => {
    const { position } = temp;
    const groundY = calculateHeight(center.x, center.z);
    const velocity = new THREE.Vector3();
    const count = Math.round(8 + strength * 6);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      position.set(center.x + dirX * 0.2, groundY + 0.05, center.z + dirZ * 0.2);
      const speed = (1.1 + Math.random() * 0.8) * (0.6 + strength * 0.5);
      velocity.set(dirX * speed, 0.15 + Math.random() * 0.25, dirZ * speed);
      emit(KIND_PUFF, position, velocity, {
        size: 0.2 + Math.random() * 0.12,
        growth: 0.7 + Math.random() * 0.4,
        life: 0.8 + Math.random() * 0.5,
        opacity: onPath ? 0.55 : 0.22,
        color: onPath ? DUST_COLOR : GRASS_DUST_COLOR,
      });
    }
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const target = targetRef?.current;

    if (target) {
      const { position, forward } = temp;
      target.getWorldPosition(position);

      if (lastPositionRef.current) {
        const verticalSpeed = (position.y - lastPositionRef.current.y) / Math.max(dt, 1e-3);
        if (verticalSpeed < -1.2) {
          airTimeRef.current += dt;
          fallSpeedRef.current = Math.max(fallSpeedRef.current, -verticalSpeed);
        } else if (Math.abs(verticalSpeed) < 0.6) {
          const nearGround = position.y - calculateHeight(position.x, position.z) < 0.4;
          if (nearGround && airTimeRef.current > 0.18 && fallSpeedRef.current > 2.5) {
            const strength = Math.min((fallSpeedRef.current - 2.5) / 6, 1);
            spawnLanding(position, strength, isOnPath(position.x, position.z));
          }
          airTimeRef.current = 0;
          fallSpeedRef.current = 0;
        }
        lastPositionRef.current.copy(position);
      } else {
        lastPositionRef.current = position.clone();
      }

      const moving = locomotion === 'run' || locomotion === 'walk';
      const grounded = airTimeRef.current === 0 && position.y - calculateHeight(position.x, position.z) < 0.3;
      if (moving && grounded && movementDirection && movementDirection.lengthSq() > 0.01) {
        stepTimerRef.current += dt;
        const interval = locomotion === 'run' ? RUN_STEP_INTERVAL : WALK_STEP_INTERVAL;
        if (stepTimerRef.current >= interval) {
          stepTimerRef.current = 0;
          forward.set(movementDirection.x, 0, movementDirection.z).normalize();
          const onPath = isOnPath(position.x, position.z);
          if (locomotion === 'run' || onPath) {
            spawnFootstep(position, forward, locomotion === 'run' ? 1 : 0.35, onPath);
          }
        }
      } else {
        stepTimerRef.current = 0;
      }
    }

    const positions = geometry.attributes.position.array;
    const sizes = geometry.attributes.aSize.array;
    const alphas = geometry.attributes.aAlpha.array;
    const kinds = geometry.attributes.aKind.array;
    const colors = geometry.attributes.aColor.array;
    const wind = sharedUniforms.uWindDirection.value;
    let anyActive = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const particle = particles[i];
      if (!particle.active) {
        if (alphas[i] !== 0) {
          alphas[i] = 0;
          anyActive = true;
        }
        continue;
      }
      anyActive = true;
      particle.life += dt;
      if (particle.life >= particle.maxLife) {
        particle.active = false;
        alphas[i] = 0;
        continue;
      }

      const t = particle.life / particle.maxLife;
      const { velocity, position } = particle;
      if (particle.kind === KIND_PUFF) {
        const drag = Math.exp(-3.2 * dt);
        velocity.x = velocity.x * drag + wind.x * 0.25 * dt;
        velocity.z = velocity.z * drag + wind.y * 0.25 * dt;
        velocity.y = velocity.y * Math.exp(-2.2 * dt) + 0.12 * dt;
      } else {
        velocity.x *= Math.exp(-1.2 * dt);
        velocity.z *= Math.exp(-1.2 * dt);
        velocity.y -= 7.5 * dt;
      }
      position.addScaledVector(velocity, dt);
      if (position.y < particle.groundY) {
        position.y = particle.groundY;
        velocity.y = 0;
        velocity.x *= 0.5;
        velocity.z *= 0.5;
      }

      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      if (particle.kind === KIND_PUFF) {
        sizes[i] = particle.size * (1 + particle.growth * Math.sqrt(t) * 2.2);
        alphas[i] = particle.opacity * Math.min(t * 8, 1) * (1 - t) * (1 - t);
      } else {
        sizes[i] = particle.size;
        alphas[i] = particle.opacity * (1 - Math.max(t - 0.7, 0) / 0.3);
      }
      kinds[i] = particle.kind;
      colors[i * 3] = particle.color.r;
      colors[i * 3 + 1] = particle.color.g;
      colors[i * 3 + 2] = particle.color.b;
    }

    if (anyActive) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
      geometry.attributes.aKind.needsUpdate = true;
      geometry.attributes.aColor.needsUpdate = true;
    }

    gl.getDrawingBufferSize(temp.bufferSize);
    material.uniforms.uPointScale.value = temp.bufferSize.y * 0.5 * state.camera.projectionMatrix.elements[5];
  });

  return createPortal(
    <points geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />,
    scene,
  );
}
