import * as THREE from "three";

import { createGameState } from "./GameState.js";
import { getDomRefs } from "../ui/dom.js";
import type { GameMode, SandboxTool, GameState } from "../types/game.js";
import { createGround, createLights, createObstacles } from "../core/world.js";
import {
  applyAtmosphere,
  setDayCyclePaused,
  setTimeOfDay,
  toggleDayCyclePause,
  updateDayNightCycle,
} from "../systems/dayNightCycle.js";
import { updateFieldOfView, resetFieldOfViewVisibility } from "../systems/fieldOfView.js";
import { updatePlayer, placePlayer } from "../entities/player.js";
import {
  removeAllZombies,
  removeNearestZombie,
  removeZombie,
  resizeDebugBubbles,
  spawnZombie,
  updateZombies,
} from "../entities/zombie.js";
import {
  removeAllTentacleCreatures,
  removeNearestTentacleCreature,
  spawnTentacleCreature,
  updateTentacleCreatures,
} from "../entities/tentacleCreature.js";
import {
  clearTransientStimuli,
  createNoise,
  createSandboxLight,
  updateStimuli,
  CLICK_NOISE_VISUAL_RADIUS,
} from "../systems/stimuli.js";
import { clearAllMemories } from "../systems/memory.js";
import {
  computeGroundIntersection,
  getGroundIntersection,
  updatePointerFromEvent,
  updatePointerPosition,
} from "../systems/pointer.js";
import { showModeInfo, updateSandboxStatus } from "../ui/devTools.js";
import { disposeMeshResources } from "../utils/dispose.js";
import {
  CAMERA_FRUSTUM,
  ISO_ROTATION,
  ISO_TILT,
} from "../config/constants.js";

export class GameApp {
  private readonly state: GameState;

  private readonly animate = () => {
    const dt = Math.min(this.state.clock.getDelta(), 0.05);
    updateDayNightCycle(this.state, dt);

    if (this.state.isInitialized) {
      if (!this.state.isGameOver) {
        this.state.survivalTime += dt;
        this.state.dom.statusTimeEl.textContent = `${this.state.survivalTime.toFixed(1)}s`;
      }

      updatePlayer(this.state, dt);
      updateStimuli(this.state, dt);
      updateTentacleCreatures(this.state, dt);
      updateZombies(this.state, dt);
      updateFieldOfView(this.state);
      this.updateCamera();

      if (this.state.mode === "sandbox") {
        updateSandboxStatus(this.state);
      }
    }

    this.state.renderer.render(this.state.scene, this.state.camera);
    requestAnimationFrame(this.animate);
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.state.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.state.keys.delete(event.code);
  };

  private readonly onResize = () => {
    this.resizeRenderer();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    updatePointerPosition(this.state, event);
  };

  private readonly onPointerLeave = () => {
    this.state.pointer.hasAim = false;
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    updatePointerFromEvent(this.state, event);
    const pointerUpdated = computeGroundIntersection(this.state, this.state.pointer.aim);
    this.state.pointer.hasAim = pointerUpdated;
    if (
      event.button !== 0 ||
      !this.state.isInitialized ||
      this.state.mode !== "sandbox" ||
      !this.state.sandboxTool
    ) {
      return;
    }

    if (!pointerUpdated) {
      return;
    }
    const point = this.state.pointer.aim.clone();
    switch (this.state.sandboxTool) {
      case "player":
        placePlayer(this.state, new THREE.Vector3(point.x, 1, point.z));
        showModeInfo(this.state, "Player positioned at the center of the map.", 2200);
        updateSandboxStatus(this.state);
        break;
      case "zombie":
        if (spawnZombie(this.state, { position: new THREE.Vector3(point.x, 1, point.z) })) {
          showModeInfo(this.state, "Spawned an extra zombie.", 2000);
        }
        break;
      case "dev-zombie":
        if (
          spawnZombie(this.state, {
            position: new THREE.Vector3(point.x, 1, point.z),
            behavior: "docile",
          })
        ) {
          showModeInfo(this.state, "Docile test zombie deployed.", 2000);
        }
        break;
      case "tentacle":
        if (
          spawnTentacleCreature(this.state, {
            position: new THREE.Vector3(point.x, 1, point.z),
          })
        ) {
          showModeInfo(this.state, "Spawned a wall-mawling.", 2200);
        }
        break;
      case "noise":
        createNoise(this.state, new THREE.Vector3(point.x, 1, point.z), 18, 14, 6, {
          visualRadius: CLICK_NOISE_VISUAL_RADIUS,
        });
        updateSandboxStatus(this.state);
        break;
      case "light":
        createSandboxLight(this.state, point, { ttl: 14, intensity: 1.8, radius: 12 });
        updateSandboxStatus(this.state);
        break;
      case "remove": {
        const point3 = new THREE.Vector3(point.x, 1, point.z);
        const tentacleRemoved = removeNearestTentacleCreature(this.state, point3, 3.5);
        if (tentacleRemoved) {
          showModeInfo(this.state, "Severed the nearest mawling.", 1600);
          updateSandboxStatus(this.state);
          break;
        }
        const zombieRemoved = removeNearestZombie(this.state, point3, 3);
        if (zombieRemoved) {
          showModeInfo(this.state, "Removed a nearby zombie.", 1600);
        } else {
          showModeInfo(this.state, "No creature close enough to remove at that point.", 1600);
        }
        break;
      }
      default:
        break;
    }
  };

  constructor() {
    const dom = getDomRefs();
    this.state = createGameState(dom);

    this.bindEvents();
    this.resizeRenderer();
    setDayCyclePaused(this.state, true);
    requestAnimationFrame(this.animate);
  }

  private bindEvents(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);

    const { canvas } = this.state.dom;
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerleave", this.onPointerLeave);

    this.state.dom.startSandboxBtn.addEventListener("click", () => this.startMode("sandbox"));
    this.state.dom.startGameBtn.addEventListener("click", () => this.startMode("game"));

    this.state.dom.spawnZombieBtn.addEventListener("click", () => {
      if (!this.state.isInitialized) {
        return;
      }
      const zombie = spawnZombie(this.state);
      if (zombie) {
        showModeInfo(this.state, "Spawned an extra zombie.", 2000);
      }
    });

    this.state.dom.spawnDevZombieBtn.addEventListener("click", () => {
      if (!this.state.isInitialized) {
        return;
      }
      const zombie = spawnZombie(this.state, { behavior: "docile" });
      if (zombie) {
        showModeInfo(this.state, "Docile test zombie deployed.", 2000);
      }
    });

    this.state.dom.spawnTentacleBtn.addEventListener("click", () => {
      if (!this.state.isInitialized) {
        return;
      }
      const creature = spawnTentacleCreature(this.state);
      if (creature) {
        showModeInfo(this.state, "Spawned a wall-mawling.", 2200);
      }
    });

    this.state.dom.spawnPlayerBtn.addEventListener("click", () => {
      if (!this.state.isInitialized) {
        return;
      }
      placePlayer(this.state, new THREE.Vector3(0, 1, 0));
      showModeInfo(this.state, "Player positioned at the center of the map.", 2200);
      updateSandboxStatus(this.state);
    });

    this.state.dom.clearStimuliBtn.addEventListener("click", () => {
      if (!this.state.isInitialized) {
        return;
      }
      clearTransientStimuli(this.state);
      showModeInfo(this.state, "Cleared noise pulses and temporary lights.", 2200);
      updateSandboxStatus(this.state);
    });

    this.state.dom.removeAllZombiesBtn.addEventListener("click", () => {
      if (!this.state.isInitialized || this.state.zombies.length === 0) {
        return;
      }
      const removed = removeAllZombies(this.state);
      showModeInfo(
        this.state,
        `Removed ${removed} zombie${removed === 1 ? "" : "s"}.`,
        2200
      );
    });

    this.state.dom.atmosphereToggleBtn.addEventListener("click", () => {
      if (!this.state.isInitialized) {
        return;
      }
      const nextState = this.state.atmosphereState === "bright" ? "dark" : "bright";
      this.state.atmosphereState = nextState;
      applyAtmosphere(this.state, this.state.atmosphereState);
      setTimeOfDay(this.state, nextState === "bright" ? "day" : "night");
      showModeInfo(
        this.state,
        this.state.atmosphereState === "bright"
          ? "Bright lab lighting enabled."
          : "Night ambience restored.",
        2200
      );
    });
    this.state.dom.dayCycleSpeedBtn.addEventListener("click", () => {
      toggleDayCyclePause(this.state);
      showModeInfo(
        this.state,
        this.state.dayNight.paused ? "Day/night cycle paused." : "Day/night cycle running.",
        2000
      );
      updateSandboxStatus(this.state);
    });

    this.state.dom.setMiddayBtn.addEventListener("click", () => {
      if (!this.state.isInitialized) {
        return;
      }
      setTimeOfDay(this.state, "day");
      showModeInfo(this.state, "Sun repositioned to midday.", 2000);
      updateSandboxStatus(this.state);
    });

    this.state.dom.setMidnightBtn.addEventListener("click", () => {
      if (!this.state.isInitialized) {
        return;
      }
      setTimeOfDay(this.state, "night");
      showModeInfo(this.state, "Sun repositioned to midnight.", 2000);
      updateSandboxStatus(this.state);
    });

    this.state.dom.removePlayerBtn.addEventListener("click", () => {
      if (!this.state.isInitialized) {
        return;
      }
      if (!this.state.player) {
        showModeInfo(this.state, "No player in the scene.", 1800);
        return;
      }
      if (this.state.player.parent) {
        this.state.player.parent.remove(this.state.player);
      }
      disposeMeshResources(this.state.player);
      this.state.player = null;
      this.state.isGameOver = false;
      this.state.dom.healthEl.textContent = "Health: --";
      showModeInfo(this.state, "Player removed. Zombies are free to roam.", 2400);
      updateSandboxStatus(this.state);
    });

    this.state.dom.toolButtons.forEach((button: HTMLButtonElement) => {
      button.addEventListener("click", () => {
        if (!this.state.isInitialized || this.state.mode !== "sandbox") {
          return;
        }
        const tool = button.dataset.tool as SandboxTool;
        this.setSandboxTool(this.state.sandboxTool === tool ? null : tool);
      });
    });
  }

  private startMode(mode: GameMode): void {
    this.state.mode = mode;
    this.setSandboxTool(null);
    this.state.dom.modeMenu.classList.add("hidden");
    this.state.dom.devToolbar.classList.toggle("hidden", mode !== "sandbox");
    if (mode === "sandbox") {
      showModeInfo(this.state, "Sandbox ready. Use the toolbar to drop entities and stimuli.", 4000);
    } else {
      showModeInfo(
        this.state,
        "Game mode is a placeholder for now. Sandbox remains available for features.",
        5000
      );
    }

    this.resetWorld();
    this.buildWorld(mode);

    this.state.atmosphereState = "bright";
    applyAtmosphere(this.state, this.state.atmosphereState);
    setTimeOfDay(this.state, "day");
    setDayCyclePaused(this.state, true);
    this.state.dom.debugPanelsContainer.classList.toggle("hidden", mode !== "sandbox");

    this.state.survivalTime = 0;
    this.state.isGameOver = false;
    this.state.clock.start();
    this.state.isInitialized = true;
    this.state.pointer.hasAim = false;
    this.state.dom.statusTimeEl.textContent = "0.0s";
    if (this.state.mode === "sandbox") {
      updateSandboxStatus(this.state);
    }
  }

  private resetWorld(): void {
    removeAllTentacleCreatures(this.state);
    removeAllZombies(this.state);
    clearAllMemories(this.state);
    clearTransientStimuli(this.state);

    if (this.state.player && this.state.player.parent) {
      this.state.player.parent.remove(this.state.player);
    }
    if (this.state.player) {
      disposeMeshResources(this.state.player);
    }
    this.state.player = null;

    if (this.state.worldRoot) {
      if (this.state.groundTiles) {
        this.state.groundTiles.children.forEach((tile: THREE.Object3D) => disposeMeshResources(tile as THREE.Mesh));
      }
      if (this.state.obstacles.length) {
        this.state.obstacles.forEach((obstacle: THREE.Mesh) => disposeMeshResources(obstacle));
      }
      this.state.scene.remove(this.state.worldRoot);
    }
    if (this.state.lightsGroup) {
      this.state.lightsGroup.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          disposeMeshResources(child as THREE.Mesh);
        }
      });
      this.state.scene.remove(this.state.lightsGroup);
    }

    this.state.worldRoot = null;
    this.state.lightsGroup = null;
    this.state.groundTiles = null;
    this.state.ambientLight = null;
    this.state.sunLight = null;
    this.state.moonLight = null;

    this.state.lightSources.length = 0;
    this.state.obstacles = [];
    this.state.zombies = [];
    this.state.tentacleCreatures = [];
    this.state.sandboxLights.length = 0;
    this.state.noiseVisuals.length = 0;
    this.state.stimuli.length = 0;

    this.state.zombieDebugPanels.clear();
    this.state.dom.debugPanelsContainer.innerHTML = "";
    this.state.pointer.hasAim = false;

    this.state.dom.healthEl.textContent = "Health: --";
    this.state.dom.statusTimeEl.textContent = "0.0s";
    updateSandboxStatus(this.state);
    resetFieldOfViewVisibility(this.state);
  }

  private buildWorld(mode: GameMode): void {
    this.state.worldRoot = new THREE.Group();
    this.state.scene.add(this.state.worldRoot);

    this.state.groundTiles = createGround(this.state);
    this.state.worldRoot.add(this.state.groundTiles);

    this.state.obstacles = createObstacles(this.state);
    this.state.obstacles.forEach((obstacle: THREE.Mesh) => this.state.worldRoot?.add(obstacle));

    this.state.lightsGroup = createLights(this.state);
    this.state.scene.add(this.state.lightsGroup);
    updateDayNightCycle(this.state, 0);

    if (mode === "game") {
      this.state.player = placePlayer(this.state, new THREE.Vector3(0, 1, 0));
      const initialZombies = 6;
      for (let i = 0; i < initialZombies; i += 1) {
        spawnZombie(this.state);
      }
    } else {
      this.state.player = null;
    }
  }

  private resizeRenderer(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.state.renderer.setSize(width, height);

    const aspect = width / height;
    this.state.camera.left = -CAMERA_FRUSTUM * aspect;
    this.state.camera.right = CAMERA_FRUSTUM * aspect;
    this.state.camera.top = CAMERA_FRUSTUM;
    this.state.camera.bottom = -CAMERA_FRUSTUM;
    this.state.camera.updateProjectionMatrix();
    resizeDebugBubbles(this.state);
  }

  private updateCamera(): void {
    const focusSource = this.state.player ? this.state.player.position : this.state.scratch.defaultFocus.set(0, 0, 0);
    const focus = this.state.scratch.vec1.copy(focusSource);
    focus.y = 0;

    const distance = this.state.player ? 38 : 34;
    const height = Math.sin(ISO_TILT) * distance;
    const planarDistance = Math.cos(ISO_TILT) * distance;

    const offsetX = Math.cos(ISO_ROTATION) * planarDistance;
    const offsetZ = Math.sin(ISO_ROTATION) * planarDistance;

    this.state.camera.position.set(
      focus.x + offsetX,
      focus.y + height,
      focus.z + offsetZ
    );
    this.state.camera.lookAt(focus);
  }

  private setSandboxTool(tool: SandboxTool | null): void {
    this.state.sandboxTool = tool;
    this.state.dom.toolButtons.forEach((button: HTMLButtonElement) => {
      button.classList.toggle("active", button.dataset.tool === this.state.sandboxTool);
    });
  }
}





