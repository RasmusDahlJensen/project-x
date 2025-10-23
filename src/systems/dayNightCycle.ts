import * as THREE from "three";

import {
  ATMOSPHERE_PRESETS,
  DAY_NIGHT_NORMAL_MULTIPLIER,
  MOON_ORBIT_DEPTH,
  MOON_ORBIT_HEIGHT,
  MOON_ORBIT_RADIUS,
  SUN_ORBIT_DEPTH,
  SUN_ORBIT_HEIGHT,
  SUN_ORBIT_RADIUS,
} from "../config/constants.js";
import type { AtmosphereState, GameState } from "../types/game.js";

export type TimeOfDay = "day" | "night";

export function setDayCyclePaused(state: GameState, paused: boolean): void {
  state.dayNight.paused = paused;
  if (!paused) {
    state.dayNight.speedMultiplier = DAY_NIGHT_NORMAL_MULTIPLIER;
  }
  state.dom.dayCycleSpeedBtn.textContent = paused ? "Day Cycle: Off" : "Day Cycle: On";
}

export function toggleDayCyclePause(state: GameState): void {
  setDayCyclePaused(state, !state.dayNight.paused);
}

export function setTimeOfDay(state: GameState, timeOfDay: TimeOfDay): void {
  const phase = timeOfDay === "day" ? 0.25 : 0.75;
  state.dayNight.time = state.dayNight.duration * phase;
  updateDayNightCycle(state, 0);
}

export function updateDayNightCycle(state: GameState, dt: number): void {
  if (!state.sunLight || !state.moonLight || !state.ambientLight || !state.currentAtmospherePreset) {
    return;
  }

  const deltaTime = state.dayNight.paused ? 0 : dt * state.dayNight.speedMultiplier;
  state.dayNight.time = (state.dayNight.time + deltaTime) % state.dayNight.duration;
  if (state.dayNight.time < 0) {
    state.dayNight.time += state.dayNight.duration;
  }
  const phase = state.dayNight.time / state.dayNight.duration;
  const sunAngle = phase * Math.PI * 2;
  const sunHeight = Math.sin(sunAngle);
  const sunBlend = THREE.MathUtils.clamp((sunHeight + 0.15) / 1.15, 0, 1);
  state.dayNight.cachedBlend = sunBlend;

  const sunX = Math.cos(sunAngle) * SUN_ORBIT_RADIUS;
  const sunY = Math.max(sunHeight * SUN_ORBIT_HEIGHT, -8);
  state.sunLight.position.set(sunX, sunY, SUN_ORBIT_DEPTH);
  state.sunLight.target.position.set(0, 0, 0);
  state.sunLight.target.updateMatrixWorld();

  const sunWarmFactor = THREE.MathUtils.clamp((sunHeight + 0.05) / 0.7, 0, 1);
  state.sunLight.color
    .copy(state.scratch.color1.setHex(state.currentAtmospherePreset.sunsetSunColor))
    .lerp(state.scratch.color2.setHex(state.currentAtmospherePreset.daySunColor), sunWarmFactor);
  state.sunLight.intensity = THREE.MathUtils.lerp(0.05, 1.35, sunBlend);

  const moonAngle = sunAngle + Math.PI;
  const moonHeight = Math.sin(moonAngle);
  const nightFactor = 1 - sunBlend;
  const moonX = Math.cos(moonAngle) * MOON_ORBIT_RADIUS;
  const moonY = Math.max(moonHeight * MOON_ORBIT_HEIGHT, -6);
  state.moonLight.position.set(moonX, moonY, MOON_ORBIT_DEPTH);
  state.moonLight.target.position.set(0, 0, 0);
  state.moonLight.target.updateMatrixWorld();
  state.moonLight.color.setHex(state.currentAtmospherePreset.moonColor);
  state.moonLight.intensity = THREE.MathUtils.lerp(0, 0.6, nightFactor);

  const ambientNightColor = state.scratch.color1.setHex(
    state.currentAtmospherePreset.nightAmbientColor
  );
  const ambientDayColor = state.scratch.color2.setHex(state.currentAtmospherePreset.dayAmbientColor);
  state.ambientLight.color.copy(ambientNightColor).lerp(ambientDayColor, sunBlend);
  state.ambientLight.intensity = THREE.MathUtils.lerp(0.28, 1.0, sunBlend);

  updateEnvironmentForBlend(state, sunBlend);
}

export function updateEnvironmentForBlend(state: GameState, blend: number): void {
  if (!state.currentAtmospherePreset) {
    return;
  }
  if (!state.scene.fog) {
    state.scene.fog = new THREE.FogExp2(state.currentAtmospherePreset.nightFogColor, 0.02);
  }

  const fogNightColor = state.scratch.color1.setHex(state.currentAtmospherePreset.nightFogColor);
  const fogDayColor = state.scratch.color2.setHex(state.currentAtmospherePreset.dayFogColor);
  const fog = state.scene.fog as THREE.FogExp2;
  fog.color.copy(fogNightColor).lerp(fogDayColor, blend);
  fog.density = THREE.MathUtils.lerp(
    state.currentAtmospherePreset.nightFogDensity,
    state.currentAtmospherePreset.dayFogDensity,
    blend
  );

  state.scratch.color1.setHex(state.currentAtmospherePreset.nightClearColor);
  state.scratch.color2.setHex(state.currentAtmospherePreset.dayClearColor);
  state.scratch.color3.copy(state.scratch.color1).lerp(state.scratch.color2, blend);
  state.renderer.setClearColor(state.scratch.color3.getHex(), 1);

  updateGroundTilesForBlend(state, blend);
}

export function updateGroundTilesForBlend(state: GameState, blend: number): void {
  if (!state.groundTiles || !state.currentAtmospherePreset) {
    return;
  }
  state.groundTiles.children.forEach((tile, index) => {
    const nightHex =
      index % 2 === 0
        ? state.currentAtmospherePreset.nightTileColorA
        : state.currentAtmospherePreset.nightTileColorB;
    const dayHex =
      index % 2 === 0
        ? state.currentAtmospherePreset.dayTileColorA
        : state.currentAtmospherePreset.dayTileColorB;
    const nightColor = state.scratch.color1.setHex(nightHex);
    const dayColor = state.scratch.color2.setHex(dayHex);
    const mesh = tile as THREE.Mesh;
    if (mesh.material && "color" in mesh.material) {
      (mesh.material as THREE.MeshStandardMaterial).color.copy(nightColor).lerp(dayColor, blend);
    }
  });
}

export function applyAtmosphere(state: GameState, mode: AtmosphereState): void {
  if (!state.scene.fog) {
    state.scene.fog = new THREE.FogExp2(0x1a2129, 0.02);
  }
  state.atmosphereState = mode;
  state.currentAtmospherePreset = ATMOSPHERE_PRESETS[mode] ?? ATMOSPHERE_PRESETS.dark;
  if (state.moonLight) {
    state.moonLight.color.setHex(state.currentAtmospherePreset.moonColor);
  }
  if (state.sunLight) {
    state.sunLight.color.setHex(state.currentAtmospherePreset.daySunColor);
  }
  updateEnvironmentForBlend(state, state.dayNight.cachedBlend);
}

