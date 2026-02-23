import { useRef, useMemo, useEffect, useState, memo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { calculateHeight } from './Ground';
import { Path } from './Paths';

// --- Shader Code from Simple_Grass ---

const VERTEX_SHADER_HEADER = `
uniform float time;
uniform float windStrength;
uniform vec3 playerPositions[10];
uniform int playerCount;

attribute vec3 offset;
attribute float scale;
attribute float rotation;
attribute float tilt; // For initial random tilt

// Simple noise function (Simplex-like)
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
  return mod289(((x*34.0)+1.0)*x);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i); // Avoid truncation effects in permutation
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}


// Rotation matrices
mat3 rotateY(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, 0, s),
        vec3(0, 1, 0),
        vec3(-s, 0, c)
    );
}

mat3 rotateX(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(1, 0, 0),
        vec3(0, c, -s),
        vec3(0, s, c)
    );
}

mat3 rotateAxis(vec3 axis, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    return mat3(
        oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.x * axis.z + axis.y * s,
        oc * axis.y * axis.x + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
        oc * axis.z * axis.x - axis.y * s,  oc * axis.z * axis.y + axis.x * s,  oc * axis.z * axis.z + c
    );
}
`;

const VERTEX_SHADER_MAIN = `
// Get world position of the instance
vec3 instancePos = offset;

// Wind calculation
float noiseVal = snoise(vec2(instancePos.x * 0.1 + time * 0.5, instancePos.z * 0.1 + time * 0.5));
float windAngle = (noiseVal * 0.5 + 0.5) * windStrength; // 0 to windStrength

// Blade properties
// float heightPercent = position.y / 1.5; // Defined in color_vertex

// Apply rotations
// 1. Initial random rotation
mat3 rotY = rotateY(rotation);

// 2. Wind bending (rotate around X axis based on wind and height)
// The tip bends more than the base
float bendAngle = windAngle * heightPercent + (tilt * heightPercent);
mat3 rotWind = rotateX(bendAngle);

// 3. Player Interaction
float maxLean = 0.0;
vec3 bestPushAxis = vec3(1.0, 0.0, 0.0);

for(int i = 0; i < 10; i++) {
    if (i >= playerCount) break;
    vec3 pPos = playerPositions[i];
    float dist = distance(instancePos.xz, pPos.xz);
    float radius = 2.0; 
    float falloff = 1.0 - smoothstep(0.0, radius, dist);
    float lean = falloff * 1.5; 

    if (lean > maxLean) {
        maxLean = lean;
        
        vec3 dir = instancePos - pPos;
        if (length(dir) < 0.001) dir = vec3(0, 0, 1);
        dir = normalize(dir);
        bestPushAxis = normalize(cross(vec3(0, 1, 0), dir));
    }
}

mat3 rotPlayer = rotateAxis(bestPushAxis, maxLean * heightPercent);


// Apply transformations
vec3 pos = position;

// Scale
pos.y *= scale; 
pos.x *= 1.0; // Keep width 

// Rotate
pos = rotWind * pos; // Bend
pos = rotY * pos;    // Orient

// Apply Player Bend (World Space)
pos = rotPlayer * pos;

// Translate
pos += instancePos;

vec3 transformed = pos;
vec3 rotatedNormal = rotY * rotWind * objectNormal;
rotatedNormal = rotPlayer * rotatedNormal;
vNormal = normalize(normalMatrix * rotatedNormal);

`;

// Detect mobile
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const GrassChunk = memo(function GrassChunk({
  chunkX,
  chunkZ,
  chunkSize,
  density,
  pathObjects,
  frequency,
  amplitude,
  material // Shared material
}) {
  const meshRef = useRef();
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const maxAttempts = density * 2;

    // Arrays per chunk
    const offsets = new Float32Array(density * 3);
    const scales = new Float32Array(density);
    const rotations = new Float32Array(density);
    const tilts = new Float32Array(density);

    let validCount = 0;
    let attempts = 0;

    const generate = () => {
      const startTime = performance.now();
      const ChunkTimeBudget = 5; // Reduced budget per chunk to allow interleaving

      while (validCount < density && attempts < maxAttempts) {
        if (validCount % 50 === 0 && performance.now() - startTime > ChunkTimeBudget) {
          setTimeout(generate, 0);
          return;
        }

        attempts++;

        // Random position local to chunk but in world coordinates
        // chunkX, chunkZ are the Top-Left (or center?) coordinates.
        // Let's assume chunkX/Z are the Center coordinates of the chunk.
        const x = (Math.random() - 0.5) * chunkSize + chunkX;
        const z = (Math.random() - 0.5) * chunkSize + chunkZ;

        // Path Check
        let minTransition = 1;
        for (let i = 0; i < pathObjects.length; i++) {
          const t = pathObjects[i].getPathTransition(x, z, 1.5);
          if (t < minTransition) minTransition = t;
          if (minTransition <= 0.05) break;
        }

        if (Math.random() > minTransition) continue;

        const groundHeight = calculateHeight(x, z, frequency, amplitude);

        const idx3 = validCount * 3;
        offsets[idx3] = x;
        offsets[idx3 + 1] = groundHeight;
        offsets[idx3 + 2] = z;

        scales[validCount] = 0.8 + Math.random() * 0.5;
        rotations[validCount] = Math.random() * Math.PI * 2;
        tilts[validCount] = Math.random() * 0.5;

        validCount++;
      }

      // Finish Geometry creation
      const bladeWidth = 0.035;
      const bladeHeight = 0.4;
      const joints = 5;
      const formatGeometry = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, joints);
      formatGeometry.translate(0, bladeHeight / 2, 0);

      const geo = new THREE.InstancedBufferGeometry();
      geo.index = formatGeometry.index;
      geo.attributes.position = formatGeometry.attributes.position;
      geo.attributes.uv = formatGeometry.attributes.uv;
      geo.attributes.normal = formatGeometry.attributes.normal;

      geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets.slice(0, validCount * 3), 3));
      geo.setAttribute('scale', new THREE.InstancedBufferAttribute(scales.slice(0, validCount), 1));
      geo.setAttribute('rotation', new THREE.InstancedBufferAttribute(rotations.slice(0, validCount), 1));
      geo.setAttribute('tilt', new THREE.InstancedBufferAttribute(tilts.slice(0, validCount), 1));

      // CRITICAL: Manually set bounding sphere for culling
      // The mesh is at [0,0,0], but the instances are at [chunkX, ..., chunkZ]
      // Radius of chunk = sqrt( (chunkSize/2)^2 + (chunkSize/2)^2 )
      const radius = (chunkSize / 2) * Math.sqrt(2);
      // Add a bit of padding for height variation and blade height
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(chunkX, 0, chunkZ), radius + 2);

      if (isMounted) {
        setGeometry(geo);
      }
    };

    setTimeout(generate, Math.random() * 100); // Random delay start to stagger chunks

    return () => { isMounted = false; };
  }, [chunkX, chunkZ, chunkSize, density, pathObjects, frequency, amplitude]);

  // Cleanup geometry when it changes or component unmounts
  useEffect(() => {
    return () => {
      if (geometry) {
        geometry.dispose();
      }
    };
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh
      ref={meshRef}
      position={[0, 0, 0]} // Mesh stays at origin, offsets are world coords
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      frustumCulled={true} // Enable Culling!
    />
  );
});

const Grass = memo(function Grass({
  maxDensity = 500000,
  width = 100,
  height = 100,
  position = [0, 0, 0],
  frequency = 0.1,
  amplitude = 1,
  paths = [],
  qualityLevel = 1, // Default to medium

  playerRef,
  players = {}, // New prop for remote players
  localPlayerId
}) {
  // Adjust density based on quality and device
  const effectiveDensity = useMemo(() => {
    let multiplier = 1;
    if (isMobile) multiplier *= 0.4; // Significantly reduce for mobile (thermal throttling prev)
    
    // Quality adjustments
    if (qualityLevel === 0) multiplier *= 0.5;
    if (qualityLevel === 2) multiplier *= 1.5;
    
    return Math.floor(maxDensity * multiplier);
  }, [maxDensity, qualityLevel]);

  // Memoize path objects once for all chunks
  const pathObjects = useMemo(() => {
    return paths.map(p => new Path(p.type, p.points, p.width, p.material));
  }, [paths]);

  // Create Material once
  const material = useMemo(() => {
    const mat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0x000000,
      specular: 0x111111,
      shininess: 10,
      side: THREE.DoubleSide,
      vertexColors: true
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.windStrength = { value: 1.0 };
      shader.uniforms.playerPositions = { value: new Array(10).fill(0).map(() => new THREE.Vector3(0, -1000, 0)) };
      shader.uniforms.playerCount = { value: 0 };
      mat.userData.shader = shader;
      shader.vertexShader = VERTEX_SHADER_HEADER + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', VERTEX_SHADER_MAIN);
      shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `
        #include <color_vertex>
        float heightPercent = position.y / 0.4;
        vColor = mix(vec3(0.0, 0.2, 0.0), vec3(0.5, 0.8, 0.2), heightPercent);
      `);
    };
    return mat;
  }, []);

  useFrame(({ clock }) => {
    if (material.userData.shader) {
      material.userData.shader.uniforms.time.value = clock.getElapsedTime();

      const positions = material.userData.shader.uniforms.playerPositions.value;
      let count = 0;

      // 1. Local Player
      if (playerRef && playerRef.current) {
        positions[count].copy(playerRef.current);
        count++;
      }

      // 2. Remote Players
      if (players) {
        Object.entries(players).forEach(([id, data]) => {
          if (id !== localPlayerId && data.position && count < 10) {
            positions[count].set(data.position.x, data.position.y, data.position.z);
            count++;
          }
        });
      }

      material.userData.shader.uniforms.playerCount.value = count;
    }
  });

  // Calculate Grid
  const chunks = useMemo(() => {
    const CHUNK_SIZE = 25; // 25x25 units per chunk
    const cols = Math.ceil(width / CHUNK_SIZE);
    const rows = Math.ceil(height / CHUNK_SIZE);
    const totalChunks = cols * rows;

    // Density per chunk to match total requested density
    const densityPerChunk = Math.floor(effectiveDensity / totalChunks);

    const chunkList = [];
    const startX = -width / 2 + CHUNK_SIZE / 2;
    const startZ = -height / 2 + CHUNK_SIZE / 2;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        chunkList.push({
          id: `chunk-${c}-${r}`,
          x: startX + c * CHUNK_SIZE + position[0],
          z: startZ + r * CHUNK_SIZE + position[2],
          size: CHUNK_SIZE,
          density: densityPerChunk
        });
      }
    }
    return chunkList;
  }, [width, height, effectiveDensity, position]);

  return (
    <group>
      {chunks.map(chunk => (
        <GrassChunk
          key={chunk.id}
          chunkX={chunk.x}
          chunkZ={chunk.z}
          chunkSize={chunk.size}
          density={chunk.density}
          pathObjects={pathObjects}
          frequency={frequency}
          amplitude={amplitude}
          material={material}
        />
      ))}
    </group>
  );
});

export default Grass;
