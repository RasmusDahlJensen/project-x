export interface DomRefs {
  canvas: HTMLCanvasElement;
  statusTimeEl: HTMLElement;
  healthEl: HTMLElement;
  modeMenu: HTMLElement;
  modeInfo: HTMLElement;
  devToolbar: HTMLElement;
  devStatus: HTMLElement;
  toolButtons: HTMLButtonElement[];
  spawnPlayerBtn: HTMLButtonElement;
  removePlayerBtn: HTMLButtonElement;
  spawnZombieBtn: HTMLButtonElement;
  spawnTentacleBtn: HTMLButtonElement;
  clearStimuliBtn: HTMLButtonElement;
  startSandboxBtn: HTMLButtonElement;
  startGameBtn: HTMLButtonElement;
  atmosphereToggleBtn: HTMLButtonElement;
  removeAllZombiesBtn: HTMLButtonElement;
  dayCycleSpeedBtn: HTMLButtonElement;
  spawnDevZombieBtn: HTMLButtonElement;
  setMiddayBtn: HTMLButtonElement;
  setMidnightBtn: HTMLButtonElement;
  debugPanelsContainer: HTMLElement;
}

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element with id "${id}" was not found.`);
  }
  return element as T;
}

function getButton(id: string): HTMLButtonElement {
  const element = getRequiredElement<HTMLButtonElement>(id);
  if (element.tagName !== "BUTTON") {
    throw new Error(`Element with id "${id}" is not a <button>.`);
  }
  return element;
}

export function getDomRefs(): DomRefs {
  const canvas = getRequiredElement<HTMLCanvasElement>("game");
  const modeInfo = getRequiredElement<HTMLElement>("mode-info");
  const dom: DomRefs = {
    canvas,
    statusTimeEl: getRequiredElement("survival-time"),
    healthEl: getRequiredElement("player-health"),
    modeMenu: getRequiredElement("mode-menu"),
    modeInfo,
    devToolbar: getRequiredElement("dev-toolbar"),
    devStatus: getRequiredElement("dev-status"),
    toolButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-tool]")
    ),
    spawnPlayerBtn: getButton("spawn-player"),
    removePlayerBtn: getButton("remove-player"),
    spawnZombieBtn: getButton("spawn-zombie"),
    spawnTentacleBtn: getButton("spawn-tentacle"),
    clearStimuliBtn: getButton("clear-stimuli"),
    startSandboxBtn: getButton("start-sandbox"),
    startGameBtn: getButton("start-game"),
    atmosphereToggleBtn: getButton("atmosphere-toggle"),
    removeAllZombiesBtn: getButton("remove-all-zombies"),
    dayCycleSpeedBtn: getButton("day-cycle-speed"),
    spawnDevZombieBtn: getButton("spawn-dev-zombie"),
    setMiddayBtn: getButton("set-midday"),
    setMidnightBtn: getButton("set-midnight"),
    debugPanelsContainer: getRequiredElement("debug-panels"),
  };
  return dom;
}
