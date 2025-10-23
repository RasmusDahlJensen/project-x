import * as THREE from "three";

import type { GameState, PlayerMesh } from "../types/game.js";
import { clampToWorld, handleObstacleCollisions, findOpenPosition } from "../core/world.js";
import { createNoise } from "../systems/stimuli.js";
import { refreshPointerAim } from "../systems/pointer.js";
import { FOOTSTEP_NOISE_CELL_SIZE } from "../config/constants.js";

function getFootstepEmitterId(position: THREE.Vector3): string {
  const cellSize = FOOTSTEP_NOISE_CELL_SIZE;
  const cellX = Math.round(position.x / cellSize);
  const cellZ = Math.round(position.z / cellSize);
  return `player-footsteps:${cellX}:${cellZ}`;
}

export function createPlayer(state: GameState): PlayerMesh {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x57c2ff, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), bodyMaterial) as unknown as PlayerMesh;
  body.position.set(0, 1, 0);

  body.castShadow = true;
  body.receiveShadow = true;
  body.userData = {
    speed: 7,
    health: 100,
    footstepCooldown: 0,
    viewDirection: new THREE.Vector3(0, 0, 1),
    onDamage: (amount: number) => {
      body.userData.health = Math.max(body.userData.health - amount, 0);
      state.dom.healthEl.textContent = `Health: ${body.userData.health.toFixed(0)}`;
      if (body.userData.health <= 0) {
        state.isGameOver = true;
        state.dom.healthEl.textContent = "Health: 0 (Down!)";
      }
      return amount;
    },
  };

  state.dom.healthEl.textContent = `Health: ${body.userData.health.toFixed(0)}`;
  return body;
}

export function updatePlayer(state: GameState, dt: number): void {
  if (!state.player || state.isGameOver) {
    return;
  }

  refreshPointerAim(state);

  const player = state.player;
  const previousPosition = player.position.clone();
  const moveDir = new THREE.Vector3();

  const cameraForward = state.scratch.vec1;
  state.camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;
  if (cameraForward.lengthSq() < 1e-6) {
    cameraForward.set(0, 0, -1);
  } else {
    cameraForward.normalize();
  }

  const worldUp = state.scratch.vec3.set(0, 1, 0);
  const cameraRight = state.scratch.vec2.copy(cameraForward).cross(worldUp);
  if (cameraRight.lengthSq() < 1e-6) {
    cameraRight.set(1, 0, 0);
  } else {
    cameraRight.normalize();
  }

  if (state.keys.has("KeyW")) moveDir.add(cameraForward);
  if (state.keys.has("KeyS")) moveDir.addScaledVector(cameraForward, -1);
  if (state.keys.has("KeyA")) moveDir.addScaledVector(cameraRight, -1);
  if (state.keys.has("KeyD")) moveDir.add(cameraRight);

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize();
  }

  const sprinting = state.keys.has("ShiftLeft") || state.keys.has("ShiftRight");
  const speed = sprinting ? player.userData.speed * 1.55 : player.userData.speed;
  player.position.addScaledVector(moveDir, speed * dt);

  clampToWorld(state, player.position);
  handleObstacleCollisions(state, player, previousPosition);

  const distanceMoved = player.position.distanceTo(previousPosition);
  const isMoving = moveDir.lengthSq() > 0;

  if (isMoving && distanceMoved > 0.001) {
    player.userData.footstepCooldown -= dt;
    if (player.userData.footstepCooldown <= 0) {
      const intensity = sprinting ? 1.4 : 1;
      const footstepEmitterId = getFootstepEmitterId(player.position);
      createNoise(
        state,
        player.position,
        10 * intensity,
        8 + intensity * 2,
        2.4,
        { emitterId: footstepEmitterId }
      );
      player.userData.footstepCooldown = sprinting ? 0.32 : 0.52;
    }
  } else {
    player.userData.footstepCooldown = Math.max(player.userData.footstepCooldown - dt, 0);
  }

  let orientationVec: THREE.Vector3 | null = null;
  if (state.pointer.hasAim) {
    state.pointer.dir.subVectors(state.pointer.aim, player.position);
    state.pointer.dir.y = 0;
    if (state.pointer.dir.lengthSq() > 0.0004) {
      orientationVec = state.pointer.dir;
    }
  }
  if (!orientationVec && moveDir.lengthSq() > 0) {
    orientationVec = moveDir;
  }
  if (orientationVec && orientationVec.lengthSq() > 0) {
    orientationVec.normalize();
    player.rotation.y = Math.atan2(orientationVec.x, orientationVec.z);
    player.userData.viewDirection.copy(orientationVec);
  }
}

export function placePlayer(state: GameState, position: THREE.Vector3): PlayerMesh | null {
  if (!state.worldRoot) {
    return null;
  }
  if (!state.player) {
    state.player = createPlayer(state);
    state.worldRoot.add(state.player);
    state.isGameOver = false;
  }
  const safePosition = findOpenPosition(state, position, 0.65);
  state.player.position.copy(safePosition);
  state.player.userData.health = 100;
  state.player.userData.footstepCooldown = 0;
  state.player.userData.viewDirection.set(0, 0, 1);
  state.player.rotation.y = 0;
  state.dom.healthEl.textContent = `Health: ${state.player.userData.health.toFixed(0)}`;
  return state.player;
}
