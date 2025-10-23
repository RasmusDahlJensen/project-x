import * as THREE from "three";

import {
  clampToWorld,
  findOpenPosition,
  handleObstacleCollisions,
  hasLineOfSight,
  randomPointNear,
} from "../core/world.js";
import type { GameState, Zombie } from "../types/game.js";
import {
  disposeDynamicMemory,
  markLightInvestigationOutcome,
  pruneZombieLightMemory,
  pruneZombieNoiseMemory,
} from "../systems/memory.js";
import { findStimulusForZombie } from "../systems/stimuli.js";
import { shouldInvestigateLight, setZombieState } from "./zombieState.js";
import {
  createZombieDebugPanel,
  positionZombieBubble,
  removeZombieDebugPanel,
  updateAllZombieBubblePositions,
  updateZombieDebugEntry,
} from "../ui/debugPanels.js";
import { updateSandboxStatus } from "../ui/devTools.js";
import { disposeMeshResources } from "../utils/dispose.js";

const ZOMBIE_GEOMETRY = new THREE.BoxGeometry(1, 2, 1);
const BASE_ZOMBIE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xb54646,
  roughness: 0.7,
  metalness: 0.2,
});

interface SpawnZombieOptions {
  position?: THREE.Vector3;
  behavior?: "aggressive" | "docile";
}

export function spawnZombie(state: GameState, options: SpawnZombieOptions = {}): Zombie | null {
  if (!state.worldRoot) {
    return null;
  }

  const behavior = options.behavior ?? "aggressive";
  const isDocile = behavior === "docile";
  const meshMaterial = BASE_ZOMBIE_MATERIAL.clone();
  if (isDocile) {
    meshMaterial.color.setHex(0x76c18f);
    if ("emissive" in meshMaterial) {
      meshMaterial.emissive.setHex(0x1a3c24);
    }
    (meshMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0.25;
  }

  const mesh = new THREE.Mesh(ZOMBIE_GEOMETRY, meshMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const spawnPos =
    options.position ??
    new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(state.world.size * 0.75),
      1,
      THREE.MathUtils.randFloatSpread(state.world.size * 0.75)
    );
  const safeSpawn = findOpenPosition(state, spawnPos, 0.6);
  mesh.position.copy(safeSpawn);

  const zombie: Zombie = {
    id: ++state.zombieIdCounter,
    mesh,
    state: "idle",
    behavior,
    isDocile,
    wanderTarget: null,
    target: null,
    wanderSpeed: isDocile ? 0 : 2.1,
    investigateSpeed: isDocile ? 0 : 2.8,
    speed: isDocile ? 0 : 3.6,
    detectRange: isDocile ? 0 : 12,
    attackRadius: isDocile ? 0 : 1.3,
    damage: isDocile ? 0 : 30,
    decisionTimer: isDocile ? 0 : THREE.MathUtils.randFloat(1, 2.5),
    investigateTimer: 0,
    lastStimulusType: null,
    reason: isDocile ? "Docile testing dummy" : "Standing by",
    currentStimulus: null,
    debugTarget: "None",
    activeStimulusId: null,
    lightMemory: new Map(),
    noiseMemory: new Map(),
  };

  state.zombies.push(zombie);
  state.worldRoot.add(mesh);

  createZombieDebugPanel(state, zombie);
  updateSandboxStatus(state);
  return zombie;
}

export function removeZombie(state: GameState, zombie: Zombie): boolean {
  const index = state.zombies.indexOf(zombie);
  if (index === -1) {
    return false;
  }
  if (zombie.mesh.parent) {
    zombie.mesh.parent.remove(zombie.mesh);
  }
  disposeMeshResources(zombie.mesh, { disposeGeometry: false });
  disposeDynamicMemory(state, zombie);
  removeZombieDebugPanel(state, zombie);
  state.zombies.splice(index, 1);
  updateSandboxStatus(state);
  return true;
}

export function removeAllZombies(state: GameState): number {
  const count = state.zombies.length;
  while (state.zombies.length > 0) {
    const target = state.zombies[0];
    if (!target) {
      break;
    }
    removeZombie(state, target);
  }
  return count;
}

export function removeNearestZombie(
  state: GameState,
  point: THREE.Vector3,
  radius = 2.5
): boolean {
  let closest: Zombie | null = null;
  let bestDistance = radius;
  state.zombies.forEach((zombie) => {
    const distance = zombie.mesh.position.distanceTo(point);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = zombie;
    }
  });
  if (closest) {
    removeZombie(state, closest);
    return true;
  }
  return false;
}

export function updateZombies(state: GameState, dt: number): void {
  if (state.zombies.length === 0) {
    return;
  }

  const hasPlayer = Boolean(state.player);
  const movementDir = new THREE.Vector3();
  const toPlayer = new THREE.Vector3();

  state.zombies.forEach((zombie) => {
    const { mesh } = zombie;
    if (zombie.isDocile) {
      zombie.state = "idle";
      zombie.reason = "Docile testing dummy";
      zombie.currentStimulus = null;
      zombie.lastStimulusType = null;
      zombie.debugTarget = "None";
      updateZombieDebugEntry(state, zombie);
      positionZombieBubble(state, zombie);
      return;
    }

    const previousPosition = mesh.position.clone();
    pruneZombieLightMemory(zombie);
    pruneZombieNoiseMemory(zombie);
    const distanceToPlayer = hasPlayer && state.player ? mesh.position.distanceTo(state.player.position) : Infinity;
    if (hasPlayer && state.player) {
      toPlayer.subVectors(state.player.position, mesh.position);
    } else {
      toPlayer.set(0, 0, 0);
    }
    const playerInSight =
      hasPlayer &&
      !!state.player &&
      !state.isGameOver &&
      distanceToPlayer < zombie.detectRange &&
      hasLineOfSight(state, mesh.position, state.player.position);

    if (playerInSight) {
      if (zombie.state !== "chasing") {
        setZombieState(
          state,
          zombie,
          "chasing",
          null,
          null,
          `Player detected (${distanceToPlayer.toFixed(1)}m)`
        );
      } else {
        zombie.reason = `Chasing player (${distanceToPlayer.toFixed(1)}m)`;
      }
      zombie.currentStimulus = "vision";
      zombie.lastStimulusType = "vision";
      zombie.debugTarget = "Player";
    } else if (
      zombie.state === "chasing" &&
      (!hasPlayer ||
        state.isGameOver ||
        distanceToPlayer > zombie.detectRange * 1.8 ||
        !playerInSight)
    ) {
      const investigateTarget =
        hasPlayer && state.player ? state.player.position.clone() : mesh.position.clone();
      setZombieState(
        state,
        zombie,
        "investigating",
        investigateTarget,
        THREE.MathUtils.randFloat(2, 3.5),
        hasPlayer ? "Lost sight of player" : "Player not present"
      );
      zombie.currentStimulus = "vision";
      zombie.lastStimulusType = "vision";
      zombie.debugTarget = hasPlayer ? "Last known player position" : "Own position";
    }

    const stimulus = !state.isGameOver ? findStimulusForZombie(state, zombie) : null;

    if (stimulus) {
      const canReactToStimulus =
        zombie.state !== "chasing" ||
        !playerInSight ||
        (stimulus.type === "noise" &&
          (!hasPlayer || distanceToPlayer > zombie.attackRadius * 3 || Math.random() < 0.45));

      if (
        canReactToStimulus &&
        (zombie.state !== "investigating" ||
          !zombie.target ||
          zombie.target.distanceTo(stimulus.position) > 0.75)
      ) {
        if (stimulus.type === "light" && !shouldInvestigateLight(zombie, stimulus)) {
          zombie.reason = "Ignoring familiar light";
        } else {
          const linger =
            stimulus.type === "light"
              ? THREE.MathUtils.randFloat(4.5, 7.5)
              : THREE.MathUtils.randFloat(2.5, 4.5);
          const reason =
            stimulus.type === "light" ? "Drawn to warm light" : "Responding to noise pulse";
          setZombieState(
            state,
            zombie,
            "investigating",
            stimulus.position.clone(),
            linger,
            reason,
            stimulus.id ?? null
          );
          zombie.lastStimulusType = stimulus.type;
          zombie.currentStimulus = stimulus.type;
          zombie.debugTarget =
            stimulus.type === "light"
              ? "Light source"
              : stimulus.type === "noise"
                ? "Noise origin"
                : "Point of interest";
        }
      }
    }

    zombie.decisionTimer -= dt;
    movementDir.set(0, 0, 0);
    let moveSpeed = zombie.wanderSpeed;

    switch (zombie.state) {
      case "chasing": {
        if (hasPlayer && state.player) {
          toPlayer.y = 0;
          if (toPlayer.lengthSq() > 0.01) {
            toPlayer.normalize();
            movementDir.copy(toPlayer);
            moveSpeed = zombie.speed;
          }
        } else {
          setZombieState(
            state,
            zombie,
            "idle",
            null,
            THREE.MathUtils.randFloat(0.5, 1.5),
            "No player to pursue"
          );
        }
        break;
      }
      case "investigating": {
        zombie.investigateTimer -= dt;
        const investigatingLight = zombie.currentStimulus === "light";
        if (!zombie.target || zombie.investigateTimer <= 0) {
          if (investigatingLight && zombie.activeStimulusId) {
            markLightInvestigationOutcome(zombie, false);
            zombie.activeStimulusId = null;
          }
          setZombieState(
            state,
            zombie,
            "idle",
            null,
            THREE.MathUtils.randFloat(1.5, 2.5),
            "Investigation window expired"
          );
          break;
        }
        movementDir.subVectors(zombie.target, mesh.position);
        movementDir.y = 0;
        const distanceToTarget = movementDir.length();
        if (distanceToTarget < 0.6) {
          if (investigatingLight && zombie.activeStimulusId) {
            markLightInvestigationOutcome(zombie, true);
            zombie.activeStimulusId = null;
          }
          if (investigatingLight && !state.isGameOver) {
            zombie.investigateTimer = THREE.MathUtils.randFloat(1.5, 3);
            zombie.reason = "Lingering at light source";
            zombie.lastStimulusType = null;
          } else {
            setZombieState(
              state,
              zombie,
              "idle",
              null,
              THREE.MathUtils.randFloat(1, 2),
              "Investigation complete"
            );
          }
          break;
        }
        movementDir.normalize();
        moveSpeed = zombie.investigateSpeed;
        zombie.reason =
          zombie.lastStimulusType === "light"
            ? `Heading to light (${distanceToTarget.toFixed(1)}m)`
            : `Tracing noise (${distanceToTarget.toFixed(1)}m)`;
        break;
      }
      case "wandering": {
        if (
          !zombie.wanderTarget ||
          mesh.position.distanceTo(zombie.wanderTarget) < 0.5 ||
          zombie.decisionTimer <= 0
        ) {
          zombie.wanderTarget = randomPointNear(state, mesh.position, 7);
          zombie.decisionTimer = THREE.MathUtils.randFloat(3, 6);
          zombie.reason = "Picked new wander point";
        }
        movementDir.subVectors(zombie.wanderTarget, mesh.position);
        movementDir.y = 0;
        if (movementDir.lengthSq() > 0.01) {
          movementDir.normalize();
          const remaining = mesh.position.distanceTo(zombie.wanderTarget);
          zombie.reason = `Wandering (${remaining.toFixed(1)}m remaining)`;
        }
        break;
      }
      case "idle":
      default: {
        zombie.reason = zombie.reason || "Idle";
        if (zombie.decisionTimer <= 0) {
          setZombieState(
            state,
            zombie,
            "wandering",
            null,
            THREE.MathUtils.randFloat(2.5, 4.5),
            "Decided to roam"
          );
        }
        break;
      }
    }

    if (movementDir.lengthSq() > 0) {
      mesh.position.addScaledVector(movementDir, moveSpeed * dt);
      mesh.rotation.y = Math.atan2(movementDir.x, movementDir.z);
    }

    clampToWorld(state, mesh.position);
    handleObstacleCollisions(state, mesh, previousPosition);

    if (hasPlayer && state.player && !state.isGameOver) {
      const newDistanceToPlayer = mesh.position.distanceTo(state.player.position);
      if (newDistanceToPlayer < zombie.attackRadius) {
        state.player.userData.onDamage(zombie.damage * dt);
        zombie.reason = `Feeding (${newDistanceToPlayer.toFixed(2)}m)`;
      }
    }

    updateZombieDebugEntry(state, zombie);
    positionZombieBubble(state, zombie);
  });
}

export function resizeDebugBubbles(state: GameState): void {
  updateAllZombieBubblePositions(state);
}


