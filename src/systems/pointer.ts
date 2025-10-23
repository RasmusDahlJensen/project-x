import * as THREE from "three";

import type { GameState } from "../types/game.js";

export function updatePointerFromEvent(state: GameState, event: PointerEvent): void {
  state.pointer.ndc.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
}

export function computeGroundIntersection(state: GameState, target: THREE.Vector3): boolean {
  if (!state.groundTiles) {
    return false;
  }

  state.raycaster.setFromCamera(state.pointer.ndc, state.camera);
  const { origin, direction } = state.raycaster.ray;
  const epsilon = 1e-5;
  if (Math.abs(direction.y) < epsilon) {
    return false;
  }

  const distanceToPlane = -origin.y / direction.y;
  if (distanceToPlane < 0) {
    return false;
  }

  target.copy(direction).multiplyScalar(distanceToPlane).add(origin);
  target.y = 0;
  return true;
}

export function refreshPointerAim(state: GameState): void {
  if (!state.pointer.hasAim) {
    return;
  }
  if (!computeGroundIntersection(state, state.pointer.aim)) {
    state.pointer.hasAim = false;
  }
}

export function updatePointerPosition(state: GameState, event: PointerEvent): boolean {
  updatePointerFromEvent(state, event);
  state.pointer.hasAim = computeGroundIntersection(state, state.pointer.aim);
  return state.pointer.hasAim;
}

export function getGroundIntersection(state: GameState, event?: PointerEvent): THREE.Vector3 | null {
  if (event) {
    updatePointerFromEvent(state, event);
  }
  if (!computeGroundIntersection(state, state.scratch.vec2)) {
    return null;
  }
  return state.scratch.vec2.clone();
}
