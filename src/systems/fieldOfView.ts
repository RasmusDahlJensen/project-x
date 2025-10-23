import * as THREE from "three";

import { PLAYER_FOV_COS } from "../config/constants.js";
import type { GameState } from "../types/game.js";
import {
  hideDynamicMemory,
  hideStaticMemory,
  updateDynamicMemoryVisibility,
  updateStaticMemoryVisibility,
} from "./memory.js";
import { updateZombieDebugEntry } from "../ui/debugPanels.js";

export function resetFieldOfViewVisibility(state: GameState): void {
  if (state.groundTiles) {
    state.groundTiles.children.forEach((tile) => {
      tile.visible = true;
    });
  }
  state.obstacles.forEach((obstacle) => {
    obstacle.visible = true;
    hideStaticMemory(state, obstacle as THREE.Mesh);
  });
  state.zombies.forEach((zombie) => {
    if (zombie.mesh) {
      zombie.mesh.visible = true;
    }
    hideDynamicMemory(state, zombie);
    const panel = state.zombieDebugPanels.get(zombie);
    if (panel) {
      panel.style.visibility = "visible";
    }
  });
  state.tentacleCreatures.forEach((creature) => {
    creature.group.visible = true;
    creature.tentacles.forEach((tentacle) => {
      tentacle.segments.forEach((segment) => {
        segment.mesh.visible = true;
      });
    });
  });
  state.noiseVisuals.forEach((entry) => {
    if (entry.mesh) {
      entry.mesh.visible = true;
    }
  });
  state.sandboxLights.forEach((entry) => {
    if (entry.light) {
      entry.light.visible = true;
    }
    if (entry.helper) {
      entry.helper.visible = true;
    }
  });
}

export function updateFieldOfView(state: GameState): void {
  if (!state.groundTiles) {
    return;
  }

  if (!state.player || !state.player.userData || !state.player.userData.viewDirection) {
    resetFieldOfViewVisibility(state);
    return;
  }

  const forward = state.scratch.vec3.copy(state.player.userData.viewDirection);
  if (forward.lengthSq() < 1e-6) {
    resetFieldOfViewVisibility(state);
    return;
  }
  forward.normalize();

  const originX = state.player.position.x;
  const originZ = state.player.position.z;
  const now = performance.now();

  const isWithinFov = (position: THREE.Vector3): boolean => {
    state.scratch.vec1.set(position.x - originX, 0, position.z - originZ);
    const distSq = state.scratch.vec1.lengthSq();
    if (distSq < 1e-4) {
      return true;
    }
    state.scratch.vec1.normalize();
    return state.scratch.vec1.dot(forward) >= PLAYER_FOV_COS;
  };

  state.groundTiles.children.forEach((tile) => {
    tile.visible = isWithinFov((tile as THREE.Mesh).position);
  });

  state.obstacles.forEach((obstacle) => {
    const visible = isWithinFov(obstacle.position);
    updateStaticMemoryVisibility(state, obstacle as THREE.Mesh, visible, now);
  });

  state.zombies.forEach((zombie) => {
    const visible = isWithinFov(zombie.mesh.position);
    updateDynamicMemoryVisibility(state, zombie, visible, now);
    const panel = state.zombieDebugPanels.get(zombie);
    if (panel) {
      panel.style.visibility = visible ? "visible" : "hidden";
    }
    updateZombieDebugEntry(state, zombie);
  });

  state.tentacleCreatures.forEach((creature) => {
    const visible = isWithinFov(creature.group.position);
    creature.group.visible = visible;
    creature.tentacles.forEach((tentacle) => {
      tentacle.segments.forEach((segment) => {
        segment.mesh.visible = visible;
      });
    });
  });

  state.noiseVisuals.forEach((entry) => {
    if (entry.mesh) {
      entry.mesh.visible = isWithinFov(entry.mesh.position);
    }
  });

  state.sandboxLights.forEach((entry) => {
    if (entry.light) {
      entry.light.visible = isWithinFov(entry.light.position);
    }
    if (entry.helper) {
      entry.helper.visible = isWithinFov(entry.helper.position as THREE.Vector3);
    }
  });
}
