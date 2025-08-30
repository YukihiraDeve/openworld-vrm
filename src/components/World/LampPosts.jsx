import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { calculateHeight } from './Ground';

// Smooth a path using Catmull-Rom similar to Paths.jsx
function smoothPath(originalPoints, resolutionPerSegment = 20) {
  if (!originalPoints || originalPoints.length < 2) return originalPoints || [];
  const smoothPoints = [];

  const extendedPoints = [...originalPoints];
  const firstDir = new THREE.Vector2(
    originalPoints[1].x - originalPoints[0].x,
    originalPoints[1].y - originalPoints[0].y
  ).normalize().multiplyScalar(-2);
  extendedPoints.unshift(new THREE.Vector2(
    originalPoints[0].x + firstDir.x,
    originalPoints[0].y + firstDir.y
  ));

  const lastIdx = originalPoints.length - 1;
  const lastDir = new THREE.Vector2(
    originalPoints[lastIdx].x - originalPoints[lastIdx - 1].x,
    originalPoints[lastIdx].y - originalPoints[lastIdx - 1].y
  ).normalize().multiplyScalar(2);
  extendedPoints.push(new THREE.Vector2(
    originalPoints[lastIdx].x + lastDir.x,
    originalPoints[lastIdx].y + lastDir.y
  ));

  const catmullRom = (p0, p1, p2, p3, t) => {
    const t2 = t * t; const t3 = t2 * t;
    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );
    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );
    return new THREE.Vector2(x, y);
  };

  for (let i = 1; i < extendedPoints.length - 2; i++) {
    const p0 = extendedPoints[i - 1];
    const p1 = extendedPoints[i];
    const p2 = extendedPoints[i + 1];
    const p3 = extendedPoints[i + 2];
    for (let t = 0; t < resolutionPerSegment; t++) {
      const u = t / resolutionPerSegment;
      smoothPoints.push(catmullRom(p0, p1, p2, p3, u));
    }
  }
  smoothPoints.push(originalPoints[originalPoints.length - 1]);
  return smoothPoints;
}

function accumulateLengths(points) {
  const lengths = [0];
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    acc += points[i].distanceTo(points[i + 1]);
    lengths.push(acc);
  }
  return { lengths, total: acc };
}

export default function LampPosts({
  paths = [],
  frequency = 0.1,
  amplitude = 1,
  spacing = 10,           // distance between lamp posts along the path
  sideOffset = 0.9,       // extra offset from road edge
  postHeight = 2.6,       // base height of the post
  postRadius = 0.07,      // radius of the pole
  lightColor = '#ffd8a8', // warm light
  lightIntensity = 6,     // intensity (physicallyCorrectLights on)
  lightDistance = 12,     // attenuation distance
  enableGlowSprite = true
}) {
  const poleMeshRef = useRef(null);
  const headMeshRef = useRef(null);
  const { scene } = useThree();

  // Lensflare/glow textures
  const glowTexture = useTexture('/assets/textures/sun/lensflare0_alpha.png');

  // Compute lamp post placements along all paths
  const placements = useMemo(() => {
    const instances = [];
    let sideToggle = 1; // alternate left/right

    for (const p of paths) {
      if (!p || !p.points || p.points.length < 2) continue;
      const smoothed = smoothPath(p.points, 20);
      if (smoothed.length < 2) continue;

      // accumulate length and place regularly
      const { lengths, total } = accumulateLengths(smoothed);
      if (total <= 0) continue;

      let nextDist = spacing * 0.5; // start a bit into the path
      while (nextDist < total) {
        // find segment containing nextDist
        let idx = 0;
        while (idx < lengths.length - 1 && lengths[idx + 1] < nextDist) idx++;
        const segStart = smoothed[idx];
        const segEnd = smoothed[idx + 1];
        const segLen = segStart.distanceTo(segEnd);
        const t = THREE.MathUtils.clamp((nextDist - lengths[idx]) / Math.max(1e-6, segLen), 0, 1);
        const x = THREE.MathUtils.lerp(segStart.x, segEnd.x, t);
        const z = THREE.MathUtils.lerp(segStart.y, segEnd.y, t);

        // tangent and normal
        const tangent = new THREE.Vector2(segEnd.x - segStart.x, segEnd.y - segStart.y).normalize();
        const normal = new THREE.Vector2(-tangent.y, tangent.x);

        // offset from path center to edge + sideOffset
        const edgeOffset = (p.width || 2) * 0.5 + sideOffset;
        const side = sideToggle; // +1 right, -1 left relative to tangent
        sideToggle *= -1;

        const px = x + normal.x * edgeOffset * side;
        const pz = z + normal.y * edgeOffset * side;
        const py = calculateHeight(px, pz, frequency, amplitude);

        // rotation yaw align with path (lamp perpendicular or parallel?)
        const yaw = Math.atan2(tangent.x, tangent.y); // face along path

        instances.push({ position: new THREE.Vector3(px, py, pz), yaw });
        nextDist += spacing;
      }
    }

    return instances;
  }, [paths, frequency, amplitude, spacing, sideOffset]);

  // Create instanced meshes for poles and lamp heads
  const poleGeometry = useMemo(() => new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 10, 1, false), [postRadius, postHeight]);
  const headGeometry = useMemo(() => new THREE.SphereGeometry(postRadius * 0.65, 12, 12), [postRadius]);

  const poleMaterial = useMemo(() => new THREE.MeshToonMaterial({ color: '#5a5a60', gradientMap: null, dithering: true }), []);
  const headMaterial = useMemo(() => new THREE.MeshToonMaterial({ color: '#f4e1b7', dithering: true }), []);

  // Populate instanced meshes
  useEffect(() => {
    if (!poleMeshRef.current || !headMeshRef.current) return;
    const poleMesh = poleMeshRef.current;
    const headMesh = headMeshRef.current;
    const dummy = new THREE.Object3D();

    poleMesh.count = placements.length;
    headMesh.count = placements.length;

    for (let i = 0; i < placements.length; i++) {
      const { position, yaw } = placements[i];

      // Pole transform (base at ground): cylinder centered at y=0, so raise by half height
      dummy.position.set(position.x, position.y + postHeight * 0.5, position.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleMesh.setMatrixAt(i, dummy.matrix);

      // Head transform sitting on top of pole
      dummy.position.set(position.x, position.y + postHeight + postRadius * 0.4, position.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      headMesh.setMatrixAt(i, dummy.matrix);
    }

    poleMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
  }, [placements, postHeight, postRadius]);

  return (
    <group>
      {/* Instanced pole and head meshes */}
      <instancedMesh ref={poleMeshRef} args={[poleGeometry, poleMaterial, Math.max(1, placements.length)]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={headMeshRef} args={[headGeometry, headMaterial, Math.max(1, placements.length)]} castShadow receiveShadow frustumCulled={false} />

      {/* Lights and optional glow sprites (non-instanced) */}
      {placements.map(({ position }, idx) => (
        <group key={`lamp-${idx}`} position={[position.x, position.y + postHeight + postRadius * 0.4, position.z]}>
          <pointLight
            color={lightColor}
            intensity={lightIntensity}
            distance={lightDistance}
            decay={2}
            castShadow={false}
          />
          {enableGlowSprite && glowTexture && (
            <sprite scale={[0.7, 0.7, 0.7]}>
              <spriteMaterial attach="material" map={glowTexture} color={lightColor} transparent opacity={0.85} depthWrite={false} />
            </sprite>
          )}
        </group>
      ))}
    </group>
  );
} 