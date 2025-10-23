import * as THREE from "three";

import type { DomRefs } from "../ui/dom.js";

export type GameMode = "sandbox" | "game";

export type SandboxTool =
  | "player"
  | "zombie"
  | "dev-zombie"
  | "tentacle"
  | "noise"
  | "light"
  | "remove";

export type AtmosphereState = "bright" | "dark";

export interface WorldConfig {
  size: number;
  tileSize: number;
  half: number;
}

export interface DayNightCycleState {
  time: number;
  duration: number;
  speedMultiplier: number;
  paused: boolean;
  cachedBlend: number;
}

export interface AtmospherePreset {
  dayAmbientColor: number;
  nightAmbientColor: number;
  dayFogColor: number;
  nightFogColor: number;
  dayFogDensity: number;
  nightFogDensity: number;
  dayClearColor: number;
  nightClearColor: number;
  daySunColor: number;
  sunsetSunColor: number;
  moonColor: number;
  dayTileColorA: number;
  dayTileColorB: number;
  nightTileColorA: number;
  nightTileColorB: number;
}

export interface Stimulus {
  id: string;
  emitterId: string | null;
  position: THREE.Vector3;
  strength: number;
  radius: number;
  ttl: number;
  fadeRate: number;
  type: "noise" | "light";
  visualRadius?: number;
  ringTtl?: number;
  ringLife?: number;
  prevRadius?: number;
  currentRadius?: number;
  hit?: Set<number>;
}

export interface LightSource {
  id: string;
  position: THREE.Vector3;
  strength: number;
  radius: number;
  type: "light";
  dynamic: boolean;
  isWorldLight?: boolean;
}

export interface SandboxLight {
  id: string;
  light: THREE.PointLight | null;
  helper: THREE.Object3D | null;
  ttl: number;
  initialTtl: number;
  baseIntensity: number;
}

export interface NoiseVisual {
  id: string;
  mesh: THREE.Mesh;
  vttl: number;
  initialVttl: number;
  maxRadius: number;
}

export interface LightMemoryEntry {
  cooldownUntil: number;
  returnChance: number;
  lastChecked: number;
}

export interface NoiseMemoryEntry {
  cooldownUntil: number;
  lastHeard: number;
}

export interface Zombie {
  id: number;
  mesh: THREE.Mesh;
  state: "idle" | "wandering" | "investigating" | "chasing";
  behavior: "aggressive" | "docile";
  isDocile: boolean;
  wanderTarget: THREE.Vector3 | null;
  target: THREE.Vector3 | null;
  wanderSpeed: number;
  investigateSpeed: number;
  speed: number;
  detectRange: number;
  attackRadius: number;
  damage: number;
  decisionTimer: number;
  investigateTimer: number;
  lastStimulusType: "vision" | "light" | "noise" | "unknown" | null;
  reason: string;
  currentStimulus: "vision" | "light" | "noise" | "unknown" | null;
  debugTarget: string;
  activeStimulusId: string | null;
  lightMemory: Map<string, LightMemoryEntry>;
  noiseMemory: Map<string, NoiseMemoryEntry>;
}

export interface TentacleSegment {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseRadius: number;
}

export interface TentacleAppendage {
  rootOffset: THREE.Vector3;
  segments: TentacleSegment[];
  reachLength: number;
  targetPoint: THREE.Vector3;
  phase: number;
  grabbing: boolean;
}

export interface TentacleAnchor {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface TentacleCreature {
  id: number;
  group: THREE.Group;
  body: THREE.Mesh;
  tentacles: TentacleAppendage[];
  currentAnchor: TentacleAnchor | null;
  wallAttractionTimer: number;
  state: "lurking" | "reaching" | "grabbing";
  moodTimer: number;
}

export interface StaticMemoryEntry {
  ghost?: THREE.Mesh;
  lastSeen: number;
}

export interface DynamicMemoryEntry {
  outline?: THREE.LineSegments;
  ring?: THREE.Mesh;
  lastSeen: number;
  lastKnownPosition: THREE.Vector3;
  lastKnownQuaternion: THREE.Quaternion;
  lastKnownScale: THREE.Vector3;
}

export interface PointerState {
  aim: THREE.Vector3;
  dir: THREE.Vector3;
  ndc: THREE.Vector2;
  hasAim: boolean;
}

export interface ScratchState {
  bubbleOffset: THREE.Vector3;
  bubbleProjection: THREE.Vector3;
  defaultFocus: THREE.Vector3;
  losRay: THREE.Ray;
  box: THREE.Box3;
  vec1: THREE.Vector3;
  vec2: THREE.Vector3;
  vec3: THREE.Vector3;
  color1: THREE.Color;
  color2: THREE.Color;
  color3: THREE.Color;
}

export interface PlayerUserData {
  speed: number;
  health: number;
  footstepCooldown: number;
  viewDirection: THREE.Vector3;
  onDamage: (amount: number) => number;
}

export type PlayerMesh = THREE.Mesh & { userData: PlayerUserData };

export interface GameState {
  dom: DomRefs;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  raycaster: THREE.Raycaster;
  clock: THREE.Clock;
  world: WorldConfig;
  worldRoot: THREE.Group | null;
  lightsGroup: THREE.Group | null;
  groundTiles: THREE.Group | null;
  ambientLight: THREE.AmbientLight | null;
  sunLight: THREE.DirectionalLight | null;
  moonLight: THREE.DirectionalLight | null;
  player: PlayerMesh | null;
  obstacles: THREE.Mesh[];
  zombies: Zombie[];
  tentacleCreatures: TentacleCreature[];
  stimuli: Stimulus[];
  lightSources: LightSource[];
  sandboxLights: SandboxLight[];
  noiseVisuals: NoiseVisual[];
  zombieDebugPanels: Map<Zombie, HTMLDivElement | null>;
  staticMemory: Map<THREE.Object3D, StaticMemoryEntry>;
  dynamicMemory: Map<Zombie, DynamicMemoryEntry>;
  dayNight: DayNightCycleState;
  pointer: PointerState;
  scratch: ScratchState;
  keys: Set<string>;
  isInitialized: boolean;
  isGameOver: boolean;
  mode: GameMode | null;
  sandboxTool: SandboxTool | null;
  survivalTime: number;
  atmosphereState: AtmosphereState;
  currentAtmospherePreset: AtmospherePreset;
  zombieIdCounter: number;
  tentacleIdCounter: number;
  stimulusIdCounter: number;
  infoTimeout?: ReturnType<typeof setTimeout>;
}
