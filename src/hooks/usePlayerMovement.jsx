import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { useControls } from '../context/ControlsContext';

const INPUT_DEADZONE = 0.1;
const NETWORK_SEND_INTERVAL_MS = 50;
const POSITION_THRESHOLD_SQ = 0.0001;
const ROTATION_THRESHOLD = 0.001;
const ROTATION_DOT_THRESHOLD = Math.cos(ROTATION_THRESHOLD / 2);
const GROUND_RAY_OFFSET = 0.35;
const GROUND_RAY_LENGTH = 0.6;
const GROUNDED_DISTANCE = 0.5;
const COYOTE_TIME = 0.14;
const JUMP_COOLDOWN = 0.3;
const WALK_JUMP_VELOCITY = 7;
const RUN_JUMP_VELOCITY = 8;

export default function usePlayerMovement(
  emitPlayerMove,
  emitPlayerAnimation,
  avatarRef,
) {
  const { movementJoystickRef } = useControls();
  const { world, rapier } = useRapier();
  const [locomotion, setLocomotion] = useState('idle');
  const locomotionRef = useRef('idle');
  const movementDirection = useMemo(() => new THREE.Vector3(), []);
  const cameraAngleRef = useRef({
    horizontal: 0,
    vertical: Math.PI / 8,
  });

  const lastPosition = useRef(new THREE.Vector3());
  const lastQuaternion = useRef(new THREE.Quaternion());
  const lastLocomotion = useRef(locomotion);
  const lastNetworkSend = useRef(0);
  const lastGroundedAt = useRef(-Infinity);
  const lastJumpAt = useRef(-Infinity);
  const jumpHeldRef = useRef(false);
  const groundRay = useMemo(
    () => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }),
    [rapier],
  );

  const isGrounded = useCallback((rigidBody) => {
    const position = rigidBody.translation();
    groundRay.origin.x = position.x;
    groundRay.origin.y = position.y + GROUND_RAY_OFFSET;
    groundRay.origin.z = position.z;
    const hit = world.castRay(
      groundRay,
      GROUND_RAY_LENGTH,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      rigidBody,
    );
    return Boolean(hit && hit.timeOfImpact <= GROUNDED_DISTANCE);
  }, [world, rapier, groundRay]);

  const setCameraAngle = useCallback((valueOrUpdater) => {
    const previous = cameraAngleRef.current;
    const next = typeof valueOrUpdater === 'function'
      ? valueOrUpdater(previous)
      : valueOrUpdater;

    if (!next) return;

    cameraAngleRef.current = {
      horizontal: next.horizontal,
      vertical: THREE.MathUtils.clamp(
        next.vertical,
        0.1,
        Math.PI / 2 - 0.1,
      ),
    };
  }, []);

  const performJump = useCallback((isRunning) => {
    const rigidBody = avatarRef.current?.rigidBodyRef?.current;
    if (!rigidBody) return;

    const now = performance.now() / 1000;
    if (now - lastJumpAt.current < JUMP_COOLDOWN) return;
    const canJump = isGrounded(rigidBody) || now - lastGroundedAt.current < COYOTE_TIME;
    if (!canJump) return;

    const velocity = rigidBody.linvel();
    rigidBody.setLinvel({
      x: velocity.x,
      y: isRunning ? RUN_JUMP_VELOCITY : WALK_JUMP_VELOCITY,
      z: velocity.z,
    }, true);
    lastJumpAt.current = now;
    lastGroundedAt.current = -Infinity;
  }, [avatarRef, isGrounded]);

  useEffect(() => {
    const handleMobileJump = () => {
      performJump(locomotionRef.current === 'run');
    };

    window.addEventListener('mobile-jump', handleMobileJump);
    return () => window.removeEventListener('mobile-jump', handleMobileJump);
  }, [performJump]);

  const updateMovement = useCallback((keysPressed) => {
    const safeKeys = keysPressed?.current ?? {};
    const horizontalAngle = cameraAngleRef.current.horizontal;
    const joystickX = Math.abs(movementJoystickRef.current?.x ?? 0) > INPUT_DEADZONE
      ? movementJoystickRef.current.x
      : 0;
    const joystickY = Math.abs(movementJoystickRef.current?.y ?? 0) > INPUT_DEADZONE
      ? movementJoystickRef.current.y
      : 0;
    const forwardInput =
      (safeKeys.KeyW ? 1 : 0) -
      (safeKeys.KeyS ? 1 : 0) +
      joystickY;
    const rightInput =
      (safeKeys.KeyD ? 1 : 0) -
      (safeKeys.KeyA ? 1 : 0) +
      joystickX;
    const sinAngle = Math.sin(horizontalAngle);
    const cosAngle = Math.cos(horizontalAngle);

    movementDirection.set(
      forwardInput * -sinAngle + rightInput * cosAngle,
      0,
      forwardInput * -cosAngle - rightInput * sinAngle,
    );

    const isMoving = movementDirection.lengthSq() > 0;
    if (isMoving) movementDirection.normalize();

    const isRunning = Boolean(safeKeys.ShiftLeft || safeKeys.ShiftRight);
    const jumpHeld = Boolean(safeKeys.Space);
    if (jumpHeld && !jumpHeldRef.current) performJump(isRunning);
    jumpHeldRef.current = jumpHeld;

    const nextLocomotion = isMoving
      ? (isRunning ? 'run' : 'walk')
      : 'idle';

    if (nextLocomotion !== locomotionRef.current) {
      locomotionRef.current = nextLocomotion;
      setLocomotion(nextLocomotion);
    }
  }, [movementDirection, movementJoystickRef, performJump]);

  useFrame(() => {
    const avatarGroup = avatarRef?.current;
    const rigidBody = avatarGroup?.rigidBodyRef?.current;
    if (!rigidBody) return;

    if (rigidBody.linvel().y < 0.5 && isGrounded(rigidBody)) {
      lastGroundedAt.current = performance.now() / 1000;
    }
    if (!emitPlayerMove) return;

    const now = performance.now();
    if (now - lastNetworkSend.current < NETWORK_SEND_INTERVAL_MS) return;

    let currentPosition;
    try {
      currentPosition = rigidBody.translation();
    } catch {
      return;
    }

    const currentQuaternion = avatarGroup.quaternion;
    if (!currentPosition || !currentQuaternion) return;

    const dx = currentPosition.x - lastPosition.current.x;
    const dy = currentPosition.y - lastPosition.current.y;
    const dz = currentPosition.z - lastPosition.current.z;
    const positionChanged = dx * dx + dy * dy + dz * dz > POSITION_THRESHOLD_SQ;
    const quaternionDot = Math.abs(
      lastQuaternion.current.x * currentQuaternion.x +
      lastQuaternion.current.y * currentQuaternion.y +
      lastQuaternion.current.z * currentQuaternion.z +
      lastQuaternion.current.w * currentQuaternion.w,
    );
    const rotationChanged = quaternionDot < ROTATION_DOT_THRESHOLD;

    if (!positionChanged && !rotationChanged) return;

    emitPlayerMove({
      position: {
        x: currentPosition.x,
        y: currentPosition.y,
        z: currentPosition.z,
      },
      rotation: {
        x: currentQuaternion.x,
        y: currentQuaternion.y,
        z: currentQuaternion.z,
        w: currentQuaternion.w,
      },
    });

    lastPosition.current.set(
      currentPosition.x,
      currentPosition.y,
      currentPosition.z,
    );
    lastQuaternion.current.copy(currentQuaternion);
    lastNetworkSend.current = now;
  });

  useEffect(() => {
    if (emitPlayerAnimation && locomotion !== lastLocomotion.current) {
      emitPlayerAnimation({ locomotion });
      lastLocomotion.current = locomotion;
    }
  }, [locomotion, emitPlayerAnimation]);

  return {
    locomotion,
    movementDirection,
    cameraAngleRef,
    setCameraAngle,
    updateMovement,
  };
}
