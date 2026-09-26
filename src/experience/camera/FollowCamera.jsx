import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { calculateHeight } from '../../components/World/terrain';
import { sharedUniforms } from '../../components/World/environment';

const MIN_ZOOM = 2;
const MAX_ZOOM = 10;
const ZOOM_SPEED = 0.008;
const PIVOT_DAMPING = 22;
const ZOOM_DAMPING = 10;
const COLLISION_IN_DAMPING = 30;
const COLLISION_OUT_DAMPING = 4;
const LOOK_AT_HEIGHT = 1.25;
const CAMERA_RADIUS = 0.25;
const MIN_DISTANCE = 0.7;
const GROUND_CLEARANCE = 0.35;
const BASE_FOV = 50;
const RUN_FOV = 55;

const createCameraFilter = (origin) => (collider) => {
  if (collider.parent()?.userData?.cameraPassThrough) return false;
  return !(collider.isSensor() && collider.containsPoint(origin));
};

export default function FollowCamera({ targetRef, angleRef, locomotion }) {
  const camera = useThree((state) => state.camera);
  const { world, rapier } = useRapier();
  const zoomRef = useRef(5);
  const smoothZoomRef = useRef(5);
  const distanceRef = useRef(5);
  const initializedRef = useRef(false);
  const locomotionRef = useRef(locomotion);
  const temp = useMemo(() => {
    const ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    return {
      target: new THREE.Vector3(),
      pivot: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      ray,
      filter: createCameraFilter(ray.origin),
    };
  }, [rapier]);

  useEffect(() => {
    locomotionRef.current = locomotion;
  }, [locomotion]);

  useEffect(() => {
    const handleWheel = (event) => {
      zoomRef.current = THREE.MathUtils.clamp(
        zoomRef.current + event.deltaY * ZOOM_SPEED,
        MIN_ZOOM,
        MAX_ZOOM,
      );
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => () => {
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    sharedUniforms.uFocusPoint.value.set(0, -1000, 0);
  }, [camera]);

  useFrame((_, delta) => {
    const targetObject = targetRef?.current;
    const angle = angleRef?.current;
    if (!targetObject || !angle) return;

    const dt = Math.min(delta, 0.1);
    const { target, pivot, direction, ray, filter } = temp;
    targetObject.getWorldPosition(target);
    target.y += LOOK_AT_HEIGHT;

    if (!initializedRef.current) {
      pivot.copy(target);
      initializedRef.current = true;
    } else {
      pivot.lerp(target, 1 - Math.exp(-PIVOT_DAMPING * dt));
    }

    smoothZoomRef.current += (zoomRef.current - smoothZoomRef.current) * (1 - Math.exp(-ZOOM_DAMPING * dt));
    const zoom = smoothZoomRef.current;

    direction.set(
      Math.sin(angle.horizontal) * Math.cos(angle.vertical),
      Math.sin(angle.vertical),
      Math.cos(angle.horizontal) * Math.cos(angle.vertical),
    );

    let allowed = zoom;
    ray.origin.x = pivot.x;
    ray.origin.y = pivot.y;
    ray.origin.z = pivot.z;
    ray.dir.x = direction.x;
    ray.dir.y = direction.y;
    ray.dir.z = direction.z;
    const hit = world.castRay(
      ray,
      zoom + CAMERA_RADIUS,
      true,
      undefined,
      undefined,
      undefined,
      targetObject.rigidBodyRef?.current,
      filter,
    );
    if (hit) allowed = Math.max(MIN_DISTANCE, hit.timeOfImpact - CAMERA_RADIUS);

    const damping = allowed < distanceRef.current ? COLLISION_IN_DAMPING : COLLISION_OUT_DAMPING;
    distanceRef.current += (allowed - distanceRef.current) * (1 - Math.exp(-damping * dt));
    distanceRef.current = Math.min(distanceRef.current, zoom);

    camera.position.copy(pivot).addScaledVector(direction, distanceRef.current);
    const ground = calculateHeight(camera.position.x, camera.position.z) + GROUND_CLEARANCE;
    if (camera.position.y < ground) camera.position.y = ground;
    camera.lookAt(pivot);
    sharedUniforms.uFocusPoint.value.copy(pivot);

    const targetFov = locomotionRef.current === 'run' ? RUN_FOV : BASE_FOV;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-3 * dt));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
