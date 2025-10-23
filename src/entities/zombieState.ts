import * as THREE from "three";

import type { GameState, Stimulus, Zombie } from "../types/game.js";
import { randomPointInWorld } from "../core/world.js";

export function setZombieState(
  state: GameState,
  zombie: Zombie,
  newState: Zombie["state"],
  target: THREE.Vector3 | null = null,
  timer: number | null = null,
  reason = "",
  stimulusId: string | null = null
): void {
  zombie.state = newState;
  zombie.reason = reason || zombie.reason || "Standing by";
  zombie.activeStimulusId = stimulusId ?? null;

  switch (newState) {
    case "chasing":
      zombie.target = null;
      zombie.wanderTarget = null;
      zombie.investigateTimer = 0;
      zombie.decisionTimer = THREE.MathUtils.randFloat(0.5, 1.5);
      zombie.currentStimulus = "vision";
      zombie.debugTarget = "Player";
      break;
    case "investigating":
      zombie.target = target ? target.clone() : null;
      zombie.investigateTimer = timer ?? THREE.MathUtils.randFloat(2, 4);
      zombie.decisionTimer = THREE.MathUtils.randFloat(2, 4);
      zombie.wanderTarget = null;
      if (!zombie.currentStimulus) {
        zombie.currentStimulus = "unknown";
      }
      if (!zombie.debugTarget || zombie.debugTarget === "None") {
        zombie.debugTarget = "Point of interest";
      }
      break;
    case "wandering":
      zombie.wanderTarget = target ? target.clone() : randomPointInWorld(state);
      zombie.decisionTimer = timer ?? THREE.MathUtils.randFloat(2.5, 4.5);
      zombie.target = null;
      zombie.investigateTimer = 0;
      zombie.currentStimulus = null;
      zombie.debugTarget = "Wander point";
      break;
    case "idle":
    default:
      zombie.target = null;
      zombie.wanderTarget = null;
      zombie.investigateTimer = 0;
      zombie.decisionTimer = timer ?? THREE.MathUtils.randFloat(1, 2.5);
      zombie.currentStimulus = null;
      zombie.debugTarget = "None";
      break;
  }
}

export function shouldInvestigateLight(zombie: Zombie, stimulus: Stimulus): boolean {
  if (!stimulus.id) {
    return true;
  }
  if (!zombie.lightMemory) {
    zombie.lightMemory = new Map();
  }
  const now = performance.now();
  const existing = zombie.lightMemory.get(stimulus.id) || {
    cooldownUntil: 0,
    returnChance: 0.75,
    lastChecked: 0,
  };

  if (now < existing.cooldownUntil) {
    const retryChance = Math.min(existing.returnChance * 0.5, 0.4);
    const shouldRetry = Math.random() < retryChance;
    existing.lastChecked = now;
    zombie.lightMemory.set(stimulus.id, existing);
    if (!shouldRetry) {
      return false;
    }
    existing.cooldownUntil = now + 10_000;
    existing.returnChance = Math.max(existing.returnChance * 0.7, 0.2);
    zombie.lightMemory.set(stimulus.id, existing);
    return true;
  }

  const chance = existing.returnChance ?? 0.75;
  const shouldPursue = Math.random() < chance;
  existing.lastChecked = now;
  if (shouldPursue) {
    existing.cooldownUntil = now + 12_000 + Math.random() * 4_000;
    existing.returnChance = Math.max(chance * 0.6, 0.2);
  } else {
    existing.cooldownUntil = now + 5_500 + Math.random() * 4_500;
    existing.returnChance = Math.max(chance * 0.85, 0.25);
  }
  zombie.lightMemory.set(stimulus.id, existing);
  return shouldPursue;
}
