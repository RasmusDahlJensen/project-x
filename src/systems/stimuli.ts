import * as THREE from "three";

import {
  CLICK_NOISE_VISUAL_RADIUS,
  NOISE_RECALL_COOLDOWN_MS,
  NOISE_RIPPLE_SPEED_MULTIPLIER,
} from "../config/constants.js";
import type { GameState, Stimulus, Zombie } from "../types/game.js";
import { disposeMeshResources } from "../utils/dispose.js";
import { setZombieState } from "../entities/zombieState.js";

interface NoiseStimulus extends Stimulus {
  type: "noise";
  visualRadius: number;
  ringTtl: number;
  ringLife: number;
  prevRadius: number;
  currentRadius: number;
  hit: Set<number>;
}

interface LightStimulus extends Stimulus {
  type: "light";
}

function isNoiseStimulus(stimulus: Stimulus): stimulus is NoiseStimulus {
  return stimulus.type === "noise";
}

function isLightStimulus(stimulus: Stimulus): stimulus is LightStimulus {
  return stimulus.type === "light";
}

export function updateStimuli(state: GameState, dt: number): void {
  for (let i = state.stimuli.length - 1; i >= 0; i -= 1) {
    const stimulus = state.stimuli[i]!;
    stimulus.ttl -= dt;
    stimulus.strength = Math.max(0, stimulus.strength - stimulus.fadeRate * dt);
    if (stimulus.ttl <= 0 || stimulus.strength <= 0.1) {
      state.stimuli.splice(i, 1);
      continue;
    }
  }

  for (let i = state.sandboxLights.length - 1; i >= 0; i -= 1) {
    const entry = state.sandboxLights[i]!;
    entry.ttl -= dt;
    if (entry.light) {
      const flicker = 0.75 + Math.random() * 0.45;
      entry.light.intensity = entry.baseIntensity * flicker;
    }
    if (entry.helper && "material" in entry.helper && entry.helper.material) {
      const material = entry.helper.material as THREE.Material & { opacity?: number };
      if (typeof material.opacity === "number") {
        material.opacity = Math.max(0, entry.ttl / entry.initialTtl);
      }
    }
    if (entry.ttl <= 0) {
      if (entry.light) {
        state.scene.remove(entry.light);
        if (typeof entry.light.dispose === "function") {
          entry.light.dispose();
        }
      }
      if (entry.helper && entry.helper.parent) {
        entry.helper.parent.remove(entry.helper);
      }
      disposeMeshResources(entry.helper);
      const sourceIndex = state.lightSources.findIndex(
        (source) => source.dynamic && source.id === entry.id
      );
      if (sourceIndex >= 0) {
        state.lightSources.splice(sourceIndex, 1);
      }
      state.sandboxLights.splice(i, 1);
    }
  }

  for (let i = state.noiseVisuals.length - 1; i >= 0; i -= 1) {
    const entry = state.noiseVisuals[i]!;
    entry.vttl -= dt;

    const lifeRatio = 1 - Math.max(0, entry.vttl) / entry.initialVttl;
    const currentRadius = THREE.MathUtils.lerp(0.001, entry.maxRadius, lifeRatio);
    entry.mesh.scale.set(currentRadius, currentRadius, 1);

    const material = entry.mesh.material as THREE.Material & { opacity?: number };
    if (material && typeof material.opacity === "number") {
      material.opacity = Math.max(0, entry.vttl / entry.initialVttl) * 0.75;
    }

    if (entry.vttl <= 0) {
      if (entry.mesh.parent) {
        entry.mesh.parent.remove(entry.mesh);
      }
      disposeMeshResources(entry.mesh);
      state.noiseVisuals.splice(i, 1);
    }
  }

  for (const stimulus of state.stimuli) {
    if (!isNoiseStimulus(stimulus)) {
      continue;
    }

    stimulus.ringLife = Math.min(stimulus.ringTtl, (stimulus.ringLife ?? 0) + dt);
    stimulus.prevRadius = stimulus.currentRadius;
    const lifeRatio = stimulus.ringTtl > 0 ? stimulus.ringLife / stimulus.ringTtl : 1;
    stimulus.currentRadius = THREE.MathUtils.lerp(0, stimulus.visualRadius, lifeRatio);

    if (stimulus.prevRadius >= stimulus.currentRadius) {
      continue;
    }

    for (const zombie of state.zombies) {
      if (state.isGameOver) {
        break;
      }
      if (stimulus.hit.has(zombie.id)) {
        continue;
      }

      const distance = zombie.mesh.position.distanceTo(stimulus.position);
      if (stimulus.prevRadius < distance && distance <= stimulus.currentRadius) {
        const key = stimulus.emitterId ?? stimulus.id;
        const now = performance.now();
        const memory = zombie.noiseMemory.get(key);

        if (memory && now < memory.cooldownUntil) {
          stimulus.hit.add(zombie.id);
          continue;
        }

        const canReact = zombie.state !== "chasing";
        if (canReact) {
          const linger = THREE.MathUtils.randFloat(2.5, 4.5);
          setZombieState(
            state,
            zombie,
            "investigating",
            stimulus.position.clone(),
            linger,
            "Heard expanding noise ring",
            stimulus.id
          );
          zombie.lastStimulusType = "noise";
          zombie.currentStimulus = "noise";
          zombie.debugTarget = "Noise origin";
        }

        zombie.noiseMemory.set(key, {
          cooldownUntil: now + NOISE_RECALL_COOLDOWN_MS,
          lastHeard: now,
        });

        stimulus.hit.add(zombie.id);
      }
    }
  }
}

export function createNoise(
  state: GameState,
  position: THREE.Vector3,
  strength: number,
  radius: number,
  ttl = 2,
  visual: { speed?: number; visualRadius?: number; emitterId?: string | null } = {}
): void {
  const speed = visual.speed ?? NOISE_RIPPLE_SPEED_MULTIPLIER;
  const visualRadius = visual.visualRadius ?? radius;
  const visualTtl = ttl / Math.max(0.001, speed);

  const stimulus: NoiseStimulus = {
    id: `noise-${state.stimulusIdCounter++}`,
    emitterId: visual.emitterId ?? null,
    position: position.clone(),
    strength,
    radius,
    ttl,
    type: "noise",
    fadeRate: strength / Math.max(ttl, 0.1),
    visualRadius,
    ringTtl: visualTtl,
    ringLife: 0,
    prevRadius: 0,
    currentRadius: 0,
    hit: new Set<number>(),
  };
  state.stimuli.push(stimulus);

  const id = `noisevis-${performance.now()}-${Math.random().toString(16).slice(2)}`;
  const ringGeometry = new THREE.RingGeometry(0.95, 1, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x66aaff,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    fog: true,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, 0.051, position.z);
  ring.scale.set(0.001, 0.001, 1);
  ring.renderOrder = 2;
  (state.worldRoot ?? state.scene).add(ring);

  state.noiseVisuals.push({
    id,
    mesh: ring,
    vttl: visualTtl,
    initialVttl: visualTtl,
    maxRadius: visualRadius,
  });
}

export function createSandboxLight(
  state: GameState,
  point: THREE.Vector3,
  options: { ttl?: number; intensity?: number; radius?: number } = {}
): void {
  const ttl = options.ttl ?? 12;
  const intensity = options.intensity ?? 1.6;
  const radius = options.radius ?? 10;

  const light = new THREE.PointLight(0xffa560, intensity, radius, 1.8);
  light.position.set(point.x, 4, point.z);
  state.scene.add(light);

  const helper = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa560, transparent: true, opacity: 0.95 })
  );
  helper.position.set(point.x, 1.1, point.z);
  if (state.worldRoot) {
    state.worldRoot.add(helper);
  }

  const id = `dynamic-${performance.now()}-${Math.random().toString(16).slice(2)}`;
  state.lightSources.push({
    id,
    position: new THREE.Vector3(point.x, 0, point.z),
    strength: intensity * 10,
    radius,
    type: "light",
    dynamic: true,
  });

  state.sandboxLights.push({
    id,
    light,
    helper,
    ttl,
    initialTtl: ttl,
    baseIntensity: intensity,
  });
}

export function clearTransientStimuli(state: GameState): void {
  state.stimuli.length = 0;

  for (let i = state.sandboxLights.length - 1; i >= 0; i -= 1) {
    const entry = state.sandboxLights[i]!;
    if (entry.light) {
      state.scene.remove(entry.light);
      if (typeof entry.light.dispose === "function") {
        entry.light.dispose();
      }
    }
    if (entry.helper && entry.helper.parent) {
      entry.helper.parent.remove(entry.helper);
    }
    disposeMeshResources(entry.helper);
    state.sandboxLights.splice(i, 1);
  }

  for (let i = state.lightSources.length - 1; i >= 0; i -= 1) {
    const source = state.lightSources[i];
    if (source?.dynamic) {
      state.lightSources.splice(i, 1);
    }
  }

  for (let i = state.noiseVisuals.length - 1; i >= 0; i -= 1) {
    const entry = state.noiseVisuals[i]!;
    if (entry.mesh.parent) {
      entry.mesh.parent.remove(entry.mesh);
    }
    disposeMeshResources(entry.mesh);
    state.noiseVisuals.splice(i, 1);
  }
}

export function findStimulusForZombie(state: GameState, zombie: Zombie): Stimulus | null {
  const position = zombie.mesh.position;
  const lightWeight = 1.6;

  let bestStimulus: Stimulus | null = null;
  let bestScore = 0;

  state.stimuli.forEach((stimulus) => {
    if (!isLightStimulus(stimulus)) {
      return;
    }
    const distance = position.distanceTo(stimulus.position);
    if (distance > stimulus.radius) {
      return;
    }
    const falloff = 0.35;
    const score = (stimulus.strength * lightWeight) / (1 + distance * falloff);
    if (score > bestScore) {
      bestScore = score;
      bestStimulus = stimulus;
    }
  });

  state.lightSources.forEach((light) => {
    if (light.isWorldLight) {
      return;
    }
    const distance = position.distanceTo(light.position);
    if (distance > light.radius) {
      return;
    }
    const flicker = 0.9 + Math.random() * 0.25;
    const score = (light.strength * lightWeight * flicker) / (1 + distance * 0.32);
    if (score > bestScore) {
      bestScore = score;
      bestStimulus = {
        id: light.id,
        emitterId: null,
        position: light.position.clone(),
        strength: light.strength,
        radius: light.radius,
        ttl: 0,
        fadeRate: 0,
        type: "light",
      };
    }
  });

  return bestStimulus;
}

export { CLICK_NOISE_VISUAL_RADIUS };
