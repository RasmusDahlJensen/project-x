import type { GameState } from "../types/game.js";

export function updateSandboxStatus(state: GameState): void {
  const { devStatus } = state.dom;
  if (!devStatus) {
    return;
  }
  const playerStatus = state.player ? "present" : "none";
  const cycleLabel = state.dayNight.paused ? "off" : "on";
  const docileCount = state.zombies.filter((zombie) => zombie.isDocile).length;
  const activeCount = state.zombies.length - docileCount;
  const tentacleCount = state.tentacleCreatures.length;
  devStatus.textContent = `Player: ${playerStatus} | Zombies: ${activeCount} | Docile: ${docileCount} | Tentacles: ${tentacleCount} | Noise: ${state.stimuli.length} | Lights: ${state.sandboxLights.length} | DayCycle: ${cycleLabel}`;
}

export function showModeInfo(state: GameState, message: string, duration = 3000): void {
  const { modeInfo } = state.dom;
  modeInfo.textContent = message;
  modeInfo.classList.remove("hidden");
  if (state.infoTimeout) {
    clearTimeout(state.infoTimeout);
  }
  state.infoTimeout = window.setTimeout(() => {
    modeInfo.classList.add("hidden");
  }, duration);
}

