import type { GameState, Zombie } from "../types/game.js";

function getStimulusLabel(zombie: Zombie): string {
  const source = zombie.currentStimulus || zombie.lastStimulusType;
  if (!source) {
    return "None";
  }
  switch (source) {
    case "vision":
      return "Vision";
    case "light":
      return "Light source";
    case "noise":
      return "Noise pulse";
    case "unknown":
      return "Residual";
    default:
      return source;
  }
}

function getTargetLabel(state: GameState, zombie: Zombie): string {
  if (zombie.debugTarget && zombie.debugTarget !== "None") {
    return zombie.debugTarget;
  }
  if (zombie.state === "chasing" && state.player) {
    return "Player";
  }
  const targetVector = zombie.target ?? zombie.wanderTarget;
  if (targetVector) {
    return `(${targetVector.x.toFixed(1)}, ${targetVector.z.toFixed(1)})`;
  }
  return "None";
}

export function createZombieDebugPanel(state: GameState, zombie: Zombie): void {
  if (state.mode !== "sandbox") {
    state.zombieDebugPanels.set(zombie, null);
    return;
  }
  const panel = document.createElement("div");
  panel.className = "thought-bubble";
  panel.dataset.zombieId = String(zombie.id);
  state.zombieDebugPanels.set(zombie, panel);
  state.dom.debugPanelsContainer.appendChild(panel);
  updateZombieDebugEntry(state, zombie);
  positionZombieBubble(state, zombie);
}

export function removeZombieDebugPanel(state: GameState, zombie: Zombie): void {
  const panel = state.zombieDebugPanels.get(zombie);
  if (panel && panel.parentElement) {
    panel.style.display = "none";
    panel.parentElement.removeChild(panel);
  }
  state.zombieDebugPanels.delete(zombie);
}

export function updateZombieDebugEntry(state: GameState, zombie: Zombie): void {
  const panel = state.zombieDebugPanels.get(zombie);
  if (!panel) {
    return;
  }
  const distanceToPlayer =
    state.player && state.player.position
      ? `${zombie.mesh.position.distanceTo(state.player.position).toFixed(1)}m`
      : "n/a";
  const stimulusLabel = getStimulusLabel(zombie);
  const targetLabel = getTargetLabel(state, zombie);

  panel.innerHTML = `
    <div class="state">${zombie.state.toUpperCase()}</div>
    <div class="reason">${zombie.reason || "Idle"}</div>
    <div class="meta">Stimulus: ${stimulusLabel}</div>
    <div class="meta">Target: ${targetLabel}</div>
    <div class="meta">Player Dist: ${distanceToPlayer}</div>
  `;
}

export function positionZombieBubble(state: GameState, zombie: Zombie): void {
  const panel = state.zombieDebugPanels.get(zombie);
  if (!panel) {
    return;
  }
  const projection = state.scratch.bubbleProjection
    .copy(zombie.mesh.position)
    .add(state.scratch.bubbleOffset)
    .project(state.camera);
  const isVisible = projection.z > -1 && projection.z < 1;
  if (!isVisible) {
    panel.style.display = "none";
    return;
  }
  const screenX = (projection.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-projection.y * 0.5 + 0.5) * window.innerHeight;
  panel.style.display = "block";
  panel.style.left = `${screenX}px`;
  panel.style.top = `${screenY}px`;
}

export function updateAllZombieBubblePositions(state: GameState): void {
  if (state.mode !== "sandbox") {
    return;
  }
  state.zombies.forEach((zombie) => positionZombieBubble(state, zombie));
}

