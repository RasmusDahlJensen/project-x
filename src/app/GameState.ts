import * as THREE from "three";

import {
  ATMOSPHERE_PRESETS,
  DAY_NIGHT_DURATION_SECONDS,
  DAY_NIGHT_NORMAL_MULTIPLIER,
  DEFAULT_WORLD_CONFIG,
} from "../config/constants.js";
import type { GameState } from "../types/game.js";
import type { DomRefs } from "../ui/dom.js";

export function createGameState(dom: DomRefs): GameState {
  const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x11151a, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0d1116, 0.035);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const raycaster = new THREE.Raycaster();

  const clock = new THREE.Clock();

  const world = { ...DEFAULT_WORLD_CONFIG };

  const state: GameState = {
    dom,
    renderer,
    scene,
    camera,
    raycaster,
    clock,
    world,
    worldRoot: null,
    lightsGroup: null,
    groundTiles: null,
    ambientLight: null,
    sunLight: null,
    moonLight: null,
    player: null,
    obstacles: [],
    zombies: [],
    tentacleCreatures: [],
    stimuli: [],
    lightSources: [],
    sandboxLights: [],
    noiseVisuals: [],
    zombieDebugPanels: new Map(),
    staticMemory: new Map(),
    dynamicMemory: new Map(),
    dayNight: {
      time: DAY_NIGHT_DURATION_SECONDS * 0.25,
      duration: DAY_NIGHT_DURATION_SECONDS,
      speedMultiplier: DAY_NIGHT_NORMAL_MULTIPLIER,
      paused: true,
      cachedBlend: 1,
    },
    pointer: {
      aim: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      ndc: new THREE.Vector2(),
      hasAim: false,
    },
    scratch: {
      bubbleOffset: new THREE.Vector3(0, 2.6, 0),
      bubbleProjection: new THREE.Vector3(),
      defaultFocus: new THREE.Vector3(0, 0, 0),
      losRay: new THREE.Ray(),
      box: new THREE.Box3(),
      vec1: new THREE.Vector3(),
      vec2: new THREE.Vector3(),
      vec3: new THREE.Vector3(),
      color1: new THREE.Color(),
      color2: new THREE.Color(),
      color3: new THREE.Color(),
    },
    keys: new Set(),
    isInitialized: false,
    isGameOver: false,
    mode: null,
    sandboxTool: null,
    survivalTime: 0,
    atmosphereState: "bright",
    currentAtmospherePreset: ATMOSPHERE_PRESETS.bright,
    zombieIdCounter: 0,
    tentacleIdCounter: 0,
    stimulusIdCounter: 0,
  };

  return state;
}
