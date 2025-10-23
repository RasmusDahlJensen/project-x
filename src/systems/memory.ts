import * as THREE from "three";

import {
  DYNAMIC_MEMORY_DURATION_MS,
  DYNAMIC_MEMORY_RING_DURATION_MS,
  DYNAMIC_MEMORY_RING_MAX_RADIUS,
  DYNAMIC_MEMORY_RING_MIN_RADIUS,
  NOISE_MEMORY_STALE_MS,
  STATIC_MEMORY_DURATION_MS,
} from "../config/constants.js";
import type { GameState, Zombie } from "../types/game.js";
import { disposeMeshResources } from "../utils/dispose.js";

function easeOutCubic(t: number): number {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const inv = 1 - clamped;
  return 1 - inv * inv * inv;
}

export function getStaticMemoryEntry(state: GameState, mesh: THREE.Mesh) {
  let entry = state.staticMemory.get(mesh);
  if (!entry) {
    const parent = mesh.parent ?? state.worldRoot ?? state.scene;
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0x97a4b3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    ghostMaterial.toneMapped = false;
    const ghost = new THREE.Mesh(mesh.geometry, ghostMaterial);
    ghost.visible = false;
    ghost.renderOrder = (mesh.renderOrder ?? 0) + 2;
    ghost.castShadow = false;
    ghost.receiveShadow = false;
    parent.add(ghost);
    entry = {
      ghost,
      lastSeen: 0,
    };
    state.staticMemory.set(mesh, entry);
  }
  return entry;
}

export function updateStaticMemoryVisibility(
  state: GameState,
  mesh: THREE.Mesh,
  visible: boolean,
  now: number
): void {
  if (visible) {
    mesh.visible = true;
    const entry = getStaticMemoryEntry(state, mesh);
    entry.lastSeen = now;
    if (entry.ghost) {
      entry.ghost.visible = false;
      const material = entry.ghost.material as THREE.Material;
      if (material) {
        material.opacity = 0;
      }
    }
    return;
  }

  mesh.visible = false;
  const entry = state.staticMemory.get(mesh);
  if (!entry || !entry.lastSeen) {
    if (entry?.ghost) {
      entry.ghost.visible = false;
    }
    return;
  }

  const elapsed = now - entry.lastSeen;
  if (elapsed >= STATIC_MEMORY_DURATION_MS) {
    if (entry.ghost) {
      entry.ghost.visible = false;
    }
    return;
  }

  const fade = 1 - elapsed / STATIC_MEMORY_DURATION_MS;
  const ghost = entry.ghost;
  if (!ghost) {
    return;
  }
  ghost.visible = true;
  ghost.position.copy(mesh.position);
  ghost.quaternion.copy(mesh.quaternion);
  ghost.scale.copy(mesh.scale);
  const material = ghost.material as THREE.Material;
  if (material) {
    material.opacity = 0.35 * fade;
  }
}

export function hideStaticMemory(state: GameState, mesh: THREE.Mesh): void {
  const entry = state.staticMemory.get(mesh);
  if (entry?.ghost) {
    entry.ghost.visible = false;
    const material = entry.ghost.material as THREE.Material;
    if (material) {
      material.opacity = 0;
    }
  }
}

export function getDynamicMemoryEntry(state: GameState, zombie: Zombie) {
  let entry = state.dynamicMemory.get(zombie);
  if (!entry) {
    const outlineGeometry = new THREE.EdgesGeometry(zombie.mesh.geometry);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: 0xffd59b,
      transparent: true,
      opacity: 0,
    });
    outlineMaterial.depthTest = false;
    outlineMaterial.depthWrite = false;
    outlineMaterial.toneMapped = false;
    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    outline.visible = false;
    outline.renderOrder = (zombie.mesh.renderOrder ?? 0) + 5;
    const parent = zombie.mesh.parent ?? state.worldRoot ?? state.scene;
    parent.add(outline);

    const ringGeometry = new THREE.RingGeometry(0.35, 0.42, 48);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb46a,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    ringMaterial.toneMapped = false;
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.visible = false;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.renderOrder = outline.renderOrder + 1;
    ring.scale.setScalar(DYNAMIC_MEMORY_RING_MIN_RADIUS);
    const ringParent = state.worldRoot ?? state.scene;
    ringParent.add(ring);

    entry = {
      outline,
      ring,
      lastSeen: 0,
      lastKnownPosition: new THREE.Vector3(),
      lastKnownQuaternion: new THREE.Quaternion(),
      lastKnownScale: new THREE.Vector3(1, 1, 1),
    };
    state.dynamicMemory.set(zombie, entry);
  }
  return entry;
}

export function updateDynamicMemoryVisibility(
  state: GameState,
  zombie: Zombie,
  visible: boolean,
  now: number
): void {
  const mesh = zombie.mesh;
  if (visible) {
    mesh.visible = true;
    const entry = getDynamicMemoryEntry(state, zombie);
    entry.lastSeen = now;
    entry.lastKnownPosition.copy(mesh.position);
    entry.lastKnownQuaternion.copy(mesh.quaternion);
    entry.lastKnownScale.copy(mesh.scale);
    if (entry.outline) {
      entry.outline.visible = false;
      const material = entry.outline.material as THREE.Material;
      if (material) {
        material.opacity = 0;
      }
    }
    if (entry.ring) {
      entry.ring.visible = false;
      const material = entry.ring.material as THREE.Material;
      if (material) {
        material.opacity = 0;
      }
      entry.ring.scale.setScalar(DYNAMIC_MEMORY_RING_MIN_RADIUS);
    }
    return;
  }

  mesh.visible = false;
  const entry = state.dynamicMemory.get(zombie);
  if (!entry || !entry.lastSeen) {
    if (entry) {
      hideDynamicMemory(state, zombie);
    }
    return;
  }

  const elapsed = now - entry.lastSeen;
  if (elapsed >= DYNAMIC_MEMORY_DURATION_MS) {
    hideDynamicMemory(state, zombie);
    return;
  }

  const fade = 1 - elapsed / DYNAMIC_MEMORY_DURATION_MS;
  const outline = entry.outline;
  if (outline) {
    outline.visible = true;
    outline.position.copy(entry.lastKnownPosition);
    outline.quaternion.copy(entry.lastKnownQuaternion);
    outline.scale.copy(entry.lastKnownScale);
    const material = outline.material as THREE.Material;
    if (material) {
      material.opacity = 0.55 * fade * fade;
    }
  }

  const ring = entry.ring;
  if (ring) {
    const material = ring.material as THREE.Material;
    if (material) {
      ring.visible = true;
      ring.position.set(entry.lastKnownPosition.x, ring.position.y, entry.lastKnownPosition.z);
      const ringProgress = easeOutCubic(Math.min(1, elapsed / DYNAMIC_MEMORY_RING_DURATION_MS));
      const radius = THREE.MathUtils.lerp(
        DYNAMIC_MEMORY_RING_MIN_RADIUS,
        DYNAMIC_MEMORY_RING_MAX_RADIUS,
        ringProgress
      );
      ring.scale.setScalar(radius);
      material.opacity = 0.45 * fade * (1 - ringProgress * 0.25);
    }
  }
}

export function hideDynamicMemory(state: GameState, zombie: Zombie): void {
  const entry = state.dynamicMemory.get(zombie);
  if (!entry) {
    return;
  }
  if (entry.outline) {
    entry.outline.visible = false;
    const material = entry.outline.material as THREE.Material;
    if (material) {
      material.opacity = 0;
    }
  }
  if (entry.ring) {
    entry.ring.visible = false;
    const material = entry.ring.material as THREE.Material;
    if (material) {
      material.opacity = 0;
    }
    entry.ring.scale.setScalar(DYNAMIC_MEMORY_RING_MIN_RADIUS);
  }
}

export function disposeDynamicMemory(state: GameState, zombie: Zombie): void {
  const entry = state.dynamicMemory.get(zombie);
  if (!entry) {
    return;
  }
  if (entry.outline) {
    if (entry.outline.parent) {
      entry.outline.parent.remove(entry.outline);
    }
    disposeMeshResources(entry.outline);
  }
  if (entry.ring) {
    if (entry.ring.parent) {
      entry.ring.parent.remove(entry.ring);
    }
    disposeMeshResources(entry.ring);
  }
  state.dynamicMemory.delete(zombie);
}

export function clearAllMemories(state: GameState): void {
  for (const [mesh, entry] of state.staticMemory.entries()) {
    if (entry.ghost && entry.ghost.parent) {
      entry.ghost.parent.remove(entry.ghost);
    }
    if (entry.ghost) {
      disposeMeshResources(entry.ghost, { disposeGeometry: false });
    }
  }
  state.staticMemory.clear();

  for (const entry of state.dynamicMemory.values()) {
    if (entry.outline && entry.outline.parent) {
      entry.outline.parent.remove(entry.outline);
    }
    if (entry.outline) {
      disposeMeshResources(entry.outline);
    }
    if (entry.ring && entry.ring.parent) {
      entry.ring.parent.remove(entry.ring);
    }
    if (entry.ring) {
      disposeMeshResources(entry.ring);
    }
  }
  state.dynamicMemory.clear();
}

export function pruneZombieLightMemory(zombie: Zombie): void {
  if (!zombie.lightMemory || zombie.lightMemory.size === 0) {
    return;
  }
  const now = performance.now();
  zombie.lightMemory.forEach((entry, id) => {
    if (now - (entry.lastChecked ?? now) > 30_000) {
      zombie.lightMemory.delete(id);
    }
  });
}

export function pruneZombieNoiseMemory(zombie: Zombie): void {
  if (!zombie.noiseMemory || zombie.noiseMemory.size === 0) {
    return;
  }
  const now = performance.now();
  zombie.noiseMemory.forEach((entry, key) => {
    if (now - (entry.lastHeard ?? now) > NOISE_MEMORY_STALE_MS) {
      zombie.noiseMemory.delete(key);
    }
  });
}

export function markLightInvestigationOutcome(zombie: Zombie, reachedTarget: boolean): void {
  if (!zombie.activeStimulusId || !zombie.lightMemory) {
    return;
  }
  const entry = zombie.lightMemory.get(zombie.activeStimulusId);
  if (!entry) {
    return;
  }
  const now = performance.now();
  entry.lastChecked = now;
  entry.cooldownUntil = now + (reachedTarget ? 15_000 : 10_000);
  entry.returnChance = Math.max(
    (entry.returnChance ?? 0.5) * (reachedTarget ? 0.4 : 0.55),
    0.15
  );
  zombie.lightMemory.set(zombie.activeStimulusId, entry);
}
