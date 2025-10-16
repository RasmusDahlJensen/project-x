// @ts-nocheck
import * as THREE from "three";

const canvas = document.getElementById("game");
const statusTimeEl = document.getElementById("survival-time");
const healthEl = document.getElementById("player-health");
const modeMenu = document.getElementById("mode-menu");
const modeInfo = document.getElementById("mode-info");
const devToolbar = document.getElementById("dev-toolbar");
const devStatus = document.getElementById("dev-status");
const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
const spawnPlayerBtn = document.getElementById("spawn-player");
const removePlayerBtn = document.getElementById("remove-player");
const spawnZombieBtn = document.getElementById("spawn-zombie");
const clearStimuliBtn = document.getElementById("clear-stimuli");
const startSandboxBtn = document.getElementById("start-sandbox");
const startGameBtn = document.getElementById("start-game");
const atmosphereToggleBtn = document.getElementById("atmosphere-toggle");
const removeAllZombiesBtn = document.getElementById("remove-all-zombies");
const dayCycleSpeedBtn = document.getElementById("day-cycle-speed");
const spawnDevZombieBtn = document.getElementById("spawn-dev-zombie");
const debugPanelsContainer = document.getElementById("debug-panels");

//Noise tuning
const NOISE_RIPPLE_SPEED_MULTIPLIER = 8;
const CLICK_NOISE_VISUAL_RADIUS = 3;
const FOOTSTEP_NOISE_CELL_SIZE = 1.5;
const DAY_NIGHT_DURATION_SECONDS = 600;
const DAY_NIGHT_ACCELERATED_MULTIPLIER = 20;
const DAY_NIGHT_NORMAL_MULTIPLIER = 1;
const SUN_ORBIT_RADIUS = 52;
const SUN_ORBIT_HEIGHT = 38;
const SUN_ORBIT_DEPTH = -28;
const MOON_ORBIT_RADIUS = 48;
const MOON_ORBIT_HEIGHT = 34;
const MOON_ORBIT_DEPTH = 32;

// Noise memory
const NOISE_RECALL_COOLDOWN_MS = 10000; // how long a zombie ignores the same emitter after hearing it
const NOISE_MEMORY_STALE_MS    = 30000; // when to forget an emitter entirely if not heard again

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x11151a, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0d1116, 0.035);

const cameraFrustum = 16;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const isoRotation = THREE.MathUtils.degToRad(45);
const isoTilt = THREE.MathUtils.degToRad(35);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const bubbleOffset = new THREE.Vector3(0, 2.6, 0);
const bubbleProjection = new THREE.Vector3();
const defaultFocus = new THREE.Vector3(0, 0, 0);
const losRay = new THREE.Ray();
const scratchBox = new THREE.Box3();
const scratchVec1 = new THREE.Vector3();
const scratchVec2 = new THREE.Vector3();
const scratchVec3 = new THREE.Vector3();
const scratchColor1 = new THREE.Color();
const scratchColor2 = new THREE.Color();
const scratchColor3 = new THREE.Color();
const pointerAim = new THREE.Vector3();
const pointerDir = new THREE.Vector3();
const pointerNdc = new THREE.Vector2();
const PLAYER_FOV_DEGREES = 90;
const PLAYER_FOV_COS = Math.cos(THREE.MathUtils.degToRad(PLAYER_FOV_DEGREES / 2));
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const STATIC_MEMORY_DURATION_MS = 12000;
const DYNAMIC_MEMORY_DURATION_MS = 6000;
const DYNAMIC_MEMORY_RING_DURATION_MS = 2400;
const DYNAMIC_MEMORY_RING_MIN_RADIUS = 0.8;
const DYNAMIC_MEMORY_RING_MAX_RADIUS = 3.2;
const staticMemory = new Map();
const dynamicMemory = new Map();

function disposeMaterial(material) {
  if (!material) {
    return;
  }
  if (Array.isArray(material)) {
    material.forEach((item) => disposeMaterial(item));
    return;
  }
  if (typeof material.dispose === "function") {
    material.dispose();
  }
}

function disposeMeshResources(mesh, { disposeGeometry = true } = {}) {
  if (!mesh) {
    return;
  }
  if (
    disposeGeometry &&
    mesh.geometry &&
    mesh.geometry !== zombieGeometry &&
    typeof mesh.geometry.dispose === "function"
  ) {
    mesh.geometry.dispose();
  }
  disposeMaterial(mesh.material);
}

function getFootstepEmitterId(position) {
  const cellSize = FOOTSTEP_NOISE_CELL_SIZE;
  const cellX = Math.round(position.x / cellSize);
  const cellZ = Math.round(position.z / cellSize);
  return `player-footsteps:${cellX}:${cellZ}`;
}

const atmospherePresets = {
  bright: {
    dayAmbientColor: 0x4a5c73,
    nightAmbientColor: 0x304150,
    dayFogColor: 0x27323d,
    nightFogColor: 0x0d1116,
    dayFogDensity: 0.02,
    nightFogDensity: 0.035,
    dayClearColor: 0x1b2631,
    nightClearColor: 0x11151a,
    daySunColor: 0xfff3c6,
    sunsetSunColor: 0xffc581,
    moonColor: 0xaabbee,
    dayTileColorA: 0x25313b,
    dayTileColorB: 0x1f2a33,
    nightTileColorA: 0x1f2830,
    nightTileColorB: 0x171d24,
  },
  dark: {
    dayAmbientColor: 0x3b4b5c,
    nightAmbientColor: 0x25313f,
    dayFogColor: 0x1d252c,
    nightFogColor: 0x080b0f,
    dayFogDensity: 0.026,
    nightFogDensity: 0.045,
    dayClearColor: 0x151c23,
    nightClearColor: 0x090c11,
    daySunColor: 0xffe6b0,
    sunsetSunColor: 0xff9e60,
    moonColor: 0xb6caff,
    dayTileColorA: 0x1f2a33,
    dayTileColorB: 0x182028,
    nightTileColorA: 0x151c24,
    nightTileColorB: 0x10161c,
  },
};

const dayNightCycle = {
  time: 0,
  duration: DAY_NIGHT_DURATION_SECONDS,
  speedMultiplier: DAY_NIGHT_NORMAL_MULTIPLIER,
  accelerated: false,
  cachedBlend: 0,
};

function setDayCycleSpeed(accelerated) {
  dayNightCycle.accelerated = accelerated;
  dayNightCycle.speedMultiplier = accelerated
    ? DAY_NIGHT_ACCELERATED_MULTIPLIER
    : DAY_NIGHT_NORMAL_MULTIPLIER;
  if (dayCycleSpeedBtn) {
    dayCycleSpeedBtn.textContent = accelerated ? "Day Cycle: Fast" : "Day Cycle: Normal";
  }
  updateSandboxStatus();
}

function toggleDayCycleSpeed() {
  setDayCycleSpeed(!dayNightCycle.accelerated);
}

const world = {
  size: 22,
  tileSize: 2,
  half: 0,
};
world.half = (world.size * world.tileSize) / 2;

const zombieGeometry = new THREE.BoxGeometry(1, 2, 1);
const zombieMaterial = new THREE.MeshStandardMaterial({
  color: 0xb54646,
  roughness: 0.7,
  metalness: 0.2,
});

let ambientLight = null;
let sunLight = null;
let moonLight = null;

let player = null;
let worldRoot = null;
let lightsGroup = null;
let groundTiles = null;
let currentMode = null;
let isInitialized = false;
let isGameOver = false;
let sandboxTool = null;
let survivalTime = 0;
let atmosphereState = "bright";
let currentAtmospherePreset = atmospherePresets[atmosphereState] || atmospherePresets.bright;
let hasPointerAim = false;

const stimuli = [];
const lightSources = [];
const sandboxLights = [];
const noiseVisuals = [];
let zombies = [];
let obstacles = [];
const zombieDebugPanels = new Map();
let zombieIdCounter = 0;
let stimulusIdCounter = 0;

const keys = new Set();
window.addEventListener("keydown", (event) => keys.add(event.code));
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("resize", resizeRenderer);
resizeRenderer();

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerleave", () => {
  hasPointerAim = false;
});

startSandboxBtn.addEventListener("click", () => bootstrap("sandbox"));
startGameBtn.addEventListener("click", () => bootstrap("game"));
if (dayCycleSpeedBtn) {
  dayCycleSpeedBtn.addEventListener("click", () => {
    toggleDayCycleSpeed();
  });
}

spawnZombieBtn.addEventListener("click", () => {
  if (!isInitialized) {
    return;
  }
  const zombie = spawnZombie();
  if (zombie) {
    showModeInfo("Spawned an extra zombie.", 2000);
  }
});

if (spawnDevZombieBtn) {
  spawnDevZombieBtn.addEventListener("click", () => {
    if (!isInitialized) {
      return;
    }
    const zombie = spawnZombie({ behavior: "docile" });
    if (zombie) {
      showModeInfo("Docile test zombie deployed.", 2000);
    }
  });
}

spawnPlayerBtn.addEventListener("click", () => {
  if (!isInitialized) {
    return;
  }
  const position = new THREE.Vector3(0, 1, 0);
  placePlayer(position);
  showModeInfo("Player positioned at the center of the map.", 2200);
});

clearStimuliBtn.addEventListener("click", () => {
  if (!isInitialized) {
    return;
  }
  clearTransientStimuli();
  showModeInfo("Cleared noise pulses and temporary lights.", 2200);
});

removeAllZombiesBtn.addEventListener("click", () => {
  if (!isInitialized || zombies.length === 0) {
    return;
  }
  const removed = removeAllZombies();
  showModeInfo(`Removed ${removed} zombie${removed === 1 ? "" : "s"}.`, 2200);
});

atmosphereToggleBtn.addEventListener("click", () => {
  if (!isInitialized) {
    return;
  }
  atmosphereState = atmosphereState === "bright" ? "dark" : "bright";
  applyAtmosphere(atmosphereState);
  showModeInfo(
    atmosphereState === "bright" ? "Bright lab lighting enabled." : "Night ambience restored.",
    2200
  );
});

removePlayerBtn.addEventListener("click", () => {
  if (!isInitialized) {
    return;
  }
  if (!player) {
    showModeInfo("No player in the scene.", 1800);
    return;
  }
  if (player.parent) {
    player.parent.remove(player);
  }
  player = null;
  isGameOver = false;
  healthEl.textContent = "Health: --";
  showModeInfo("Player removed. Zombies are free to roam.", 2400);
  updateSandboxStatus();
});

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!isInitialized || currentMode !== "sandbox") {
      return;
    }
    const tool = button.dataset.tool;
    setSandboxTool(sandboxTool === tool ? null : tool);
  });
});

requestAnimationFrame(animate);
setDayCycleSpeed(false);

function bootstrap(mode) {
  currentMode = mode;
  setSandboxTool(null);
  modeMenu.classList.add("hidden");
  devToolbar.classList.toggle("hidden", mode !== "sandbox");
  if (mode === "sandbox") {
    showModeInfo("Sandbox ready. Use the toolbar to drop entities and stimuli.", 4000);
  } else {
    showModeInfo("Game mode is a placeholder for now. Sandbox remains available for features.", 5000);
  }

  resetWorld();
  buildWorld(mode);

  atmosphereState = mode === "sandbox" ? "bright" : "dark";
  applyAtmosphere(atmosphereState);
  if (debugPanelsContainer) {
    debugPanelsContainer.classList.toggle("hidden", mode !== "sandbox");
  }

  survivalTime = 0;
  isGameOver = false;
  clock.start();
  isInitialized = true;
  if (currentMode === "sandbox") {
    updateSandboxStatus();
  }
}

function resetWorld() {
  removeAllZombies();
  clearAllMemories();

  if (player && player.parent) {
    player.parent.remove(player);
  }
  if (player) {
    disposeMeshResources(player);
  }
  player = null;

  if (worldRoot) {
    if (groundTiles) {
      groundTiles.children.forEach((tile) => disposeMeshResources(tile));
    }
    if (obstacles.length) {
      obstacles.forEach((obstacle) => disposeMeshResources(obstacle));
    }
    scene.remove(worldRoot);
  }
  if (lightsGroup) {
    lightsGroup.traverse((child) => {
      if (child.isMesh) {
        disposeMeshResources(child);
      }
    });
    scene.remove(lightsGroup);
  }

  sandboxLights.forEach((entry) => {
    scene.remove(entry.light);
    if (typeof entry.light.dispose === "function") {
      entry.light.dispose();
    }
    if (entry.helper && entry.helper.parent) {
      entry.helper.parent.remove(entry.helper);
    }
    if (entry.helper) {
      disposeMeshResources(entry.helper);
    }
  });

  stimuli.length = 0;
  lightSources.length = 0;

  noiseVisuals.forEach((entry) => {
    if (entry.mesh && entry.mesh.parent) {
      entry.mesh.parent.remove(entry.mesh);
    }
    disposeMeshResources(entry.mesh);
  });
  noiseVisuals.length = 0;

  sandboxLights.length = 0;
  zombies = [];
  obstacles = [];
  stimulusIdCounter = 0;
  worldRoot = null;
  lightsGroup = null;
  groundTiles = null;
  ambientLight = null;
  sunLight = null;
  moonLight = null;
  zombieDebugPanels.clear();
  hasPointerAim = false;
  if (debugPanelsContainer) {
    debugPanelsContainer.innerHTML = "";
  }
  healthEl.textContent = "Health: --";
  statusTimeEl.textContent = "0.0s";
}

function buildWorld(mode) {
  worldRoot = new THREE.Group();
  scene.add(worldRoot);

  groundTiles = createGround();
  worldRoot.add(groundTiles);

  obstacles = createObstacles();
  obstacles.forEach((obstacle) => worldRoot.add(obstacle));

  lightsGroup = createLights();
  scene.add(lightsGroup);
  updateDayNightCycle(0);

  if (mode === "game") {
    player = createPlayer();
    worldRoot.add(player);
    healthEl.textContent = "Health: 100";

    const initialZombies = 6;
    for (let i = 0; i < initialZombies; i += 1) {
      spawnZombie();
    }
  } else {
    player = null;
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateDayNightCycle(dt);

  if (isInitialized) {
    if (!isGameOver) {
      survivalTime += dt;
      statusTimeEl.textContent = `${survivalTime.toFixed(1)}s`;
    }

    updatePlayer(dt);
    updateStimuli(dt);
    updateZombies(dt);
    updateFieldOfView();
    updateCamera();

    if (currentMode === "sandbox") {
      updateSandboxStatus();
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updatePlayer(dt) {
  if (!player || isGameOver) {
    return;
  }

  refreshPointerAim();

  const previousPosition = player.position.clone();
  const moveDir = new THREE.Vector3();

  const cameraForward = scratchVec1;
  camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;
  if (cameraForward.lengthSq() < 1e-6) {
    cameraForward.set(0, 0, -1);
  } else {
    cameraForward.normalize();
  }

  const cameraRight = scratchVec2.copy(cameraForward).cross(WORLD_UP);
  if (cameraRight.lengthSq() < 1e-6) {
    cameraRight.set(1, 0, 0);
  } else {
    cameraRight.normalize();
  }

  if (keys.has("KeyW")) moveDir.add(cameraForward);
  if (keys.has("KeyS")) moveDir.addScaledVector(cameraForward, -1);
  if (keys.has("KeyA")) moveDir.addScaledVector(cameraRight, -1);
  if (keys.has("KeyD")) moveDir.add(cameraRight);

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize();
  }

  const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const speed = sprinting ? player.userData.speed * 1.55 : player.userData.speed;
  player.position.addScaledVector(moveDir, speed * dt);

  clampToWorld(player.position);
  handleObstacleCollisions(player, previousPosition);

  const distanceMoved = player.position.distanceTo(previousPosition);
  const isMoving = moveDir.lengthSq() > 0;

  if (isMoving && distanceMoved > 0.001) {
    player.userData.footstepCooldown -= dt;
    if (player.userData.footstepCooldown <= 0) {
      const intensity = sprinting ? 1.4 : 1;
      const footstepEmitterId = getFootstepEmitterId(player.position);
      createNoise(player.position, 10 * intensity, 8 + intensity * 2, 2.4, {
        emitterId: footstepEmitterId,
      });
      player.userData.footstepCooldown = sprinting ? 0.32 : 0.52;
    }
  } else {
    player.userData.footstepCooldown = Math.max(player.userData.footstepCooldown - dt, 0);
  }

  let orientationVec = null;
  if (hasPointerAim) {
    pointerDir.subVectors(pointerAim, player.position);
    pointerDir.y = 0;
    if (pointerDir.lengthSq() > 0.0004) {
      orientationVec = pointerDir;
    }
  }
  if (!orientationVec && moveDir.lengthSq() > 0) {
    orientationVec = moveDir;
  }
  if (orientationVec && orientationVec.lengthSq() > 0) {
    orientationVec.normalize();
    player.rotation.y = Math.atan2(orientationVec.x, orientationVec.z);
    if (player.userData && player.userData.viewDirection) {
      player.userData.viewDirection.copy(orientationVec);
    }
  }
}

function resetFieldOfViewVisibility() {
  if (groundTiles) {
    groundTiles.children.forEach((tile) => {
      tile.visible = true;
    });
  }
  obstacles.forEach((obstacle) => {
    obstacle.visible = true;
    hideStaticMemory(obstacle);
  });
  zombies.forEach((zombie) => {
    if (zombie.mesh) {
      zombie.mesh.visible = true;
    }
    hideDynamicMemory(zombie);
    const panel = zombieDebugPanels.get(zombie);
    if (panel) {
      panel.style.visibility = "visible";
    }
  });
  noiseVisuals.forEach((entry) => {
    if (entry.mesh) {
      entry.mesh.visible = true;
    }
  });
  sandboxLights.forEach((entry) => {
    if (entry.light) {
      entry.light.visible = true;
    }
    if (entry.helper) {
      entry.helper.visible = true;
    }
  });
}

function getStaticMemoryEntry(mesh) {
  let entry = staticMemory.get(mesh);
  if (!entry) {
    const parent = mesh.parent ?? worldRoot ?? scene;
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0x97a4b3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    ghostMaterial.toneMapped = false;
    const ghost = new THREE.Mesh(mesh.geometry, ghostMaterial);
    ghost.visible = false;
    ghost.renderOrder = (mesh.renderOrder ?? 0) + 2;
    ghost.castShadow = false;
    ghost.receiveShadow = false;
    parent.add(ghost);
    entry = {
      ghost,
      lastSeen: 0,
    };
    staticMemory.set(mesh, entry);
  }
  return entry;
}

function updateStaticMemoryVisibility(mesh, visible, now) {
  if (visible) {
    mesh.visible = true;
    const entry = getStaticMemoryEntry(mesh);
    entry.lastSeen = now;
    if (entry.ghost) {
      entry.ghost.visible = false;
      if (entry.ghost.material) {
        entry.ghost.material.opacity = 0;
      }
    }
    return;
  }

  mesh.visible = false;
  const entry = staticMemory.get(mesh);
  if (!entry || !entry.lastSeen) {
    if (entry?.ghost) {
      entry.ghost.visible = false;
    }
    return;
  }

  const elapsed = now - entry.lastSeen;
  if (elapsed >= STATIC_MEMORY_DURATION_MS) {
    if (entry.ghost) {
      entry.ghost.visible = false;
    }
    return;
  }

  const fade = 1 - elapsed / STATIC_MEMORY_DURATION_MS;
  const ghost = entry.ghost;
  if (!ghost) {
    return;
  }
  ghost.visible = true;
  ghost.position.copy(mesh.position);
  ghost.quaternion.copy(mesh.quaternion);
  ghost.scale.copy(mesh.scale);
  const material = ghost.material;
  if (material) {
    material.opacity = 0.35 * fade;
  }
}

function hideStaticMemory(mesh) {
  const entry = staticMemory.get(mesh);
  if (entry?.ghost) {
    entry.ghost.visible = false;
    if (entry.ghost.material) {
      entry.ghost.material.opacity = 0;
    }
  }
}

function getDynamicMemoryEntry(zombie) {
  let entry = dynamicMemory.get(zombie);
  if (!entry) {
    const outlineGeometry = new THREE.EdgesGeometry(zombie.mesh.geometry);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: 0xffd59b,
      transparent: true,
      opacity: 0,
    });
    outlineMaterial.depthTest = false;
    outlineMaterial.depthWrite = false;
    outlineMaterial.toneMapped = false;
    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    outline.visible = false;
    outline.renderOrder = (zombie.mesh.renderOrder ?? 0) + 5;
    const parent = zombie.mesh.parent ?? worldRoot ?? scene;
    parent.add(outline);

    const ringGeometry = new THREE.RingGeometry(0.35, 0.42, 48);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb46a,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    ringMaterial.toneMapped = false;
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.visible = false;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.renderOrder = outline.renderOrder + 1;
    ring.scale.setScalar(DYNAMIC_MEMORY_RING_MIN_RADIUS);
    const ringParent = worldRoot ?? scene;
    ringParent.add(ring);

    entry = {
      outline,
      ring,
      lastSeen: 0,
      lastKnownPosition: new THREE.Vector3(),
      lastKnownQuaternion: new THREE.Quaternion(),
      lastKnownScale: new THREE.Vector3(1, 1, 1),
    };
    dynamicMemory.set(zombie, entry);
  }
  return entry;
}

function updateDynamicMemoryVisibility(zombie, visible, now) {
  const mesh = zombie.mesh;
  if (visible) {
    mesh.visible = true;
    const entry = getDynamicMemoryEntry(zombie);
    entry.lastSeen = now;
    entry.lastKnownPosition.copy(mesh.position);
    entry.lastKnownQuaternion.copy(mesh.quaternion);
    entry.lastKnownScale.copy(mesh.scale);
    if (entry.outline) {
      entry.outline.visible = false;
      if (entry.outline.material) {
        entry.outline.material.opacity = 0;
      }
    }
    if (entry.ring) {
      entry.ring.visible = false;
      if (entry.ring.material) {
        entry.ring.material.opacity = 0;
      }
      entry.ring.scale.setScalar(DYNAMIC_MEMORY_RING_MIN_RADIUS);
    }
    return;
  }

  mesh.visible = false;
  const entry = dynamicMemory.get(zombie);
  if (!entry || !entry.lastSeen) {
    if (entry) {
      hideDynamicMemory(zombie);
    }
    return;
  }

  const elapsed = now - entry.lastSeen;
  if (elapsed >= DYNAMIC_MEMORY_DURATION_MS) {
    hideDynamicMemory(zombie);
    return;
  }

  const fade = 1 - elapsed / DYNAMIC_MEMORY_DURATION_MS;
  const outline = entry.outline;
  if (outline) {
    outline.visible = true;
    outline.position.copy(entry.lastKnownPosition);
    outline.quaternion.copy(entry.lastKnownQuaternion);
    outline.scale.copy(entry.lastKnownScale);
    if (outline.material) {
      outline.material.opacity = 0.55 * fade * fade;
    }
  }

  const ring = entry.ring;
  if (ring && ring.material) {
    ring.visible = true;
    ring.position.set(entry.lastKnownPosition.x, ring.position.y, entry.lastKnownPosition.z);
    const ringProgress = easeOutCubic(Math.min(1, elapsed / DYNAMIC_MEMORY_RING_DURATION_MS));
    const radius = THREE.MathUtils.lerp(
      DYNAMIC_MEMORY_RING_MIN_RADIUS,
      DYNAMIC_MEMORY_RING_MAX_RADIUS,
      ringProgress
    );
    ring.scale.setScalar(radius);
    ring.material.opacity = 0.45 * fade * (1 - ringProgress * 0.25);
  }
}

function hideDynamicMemory(zombie) {
  const entry = dynamicMemory.get(zombie);
  if (!entry) {
    return;
  }
  if (entry.outline) {
    entry.outline.visible = false;
    if (entry.outline.material) {
      entry.outline.material.opacity = 0;
    }
  }
  if (entry.ring) {
    entry.ring.visible = false;
    if (entry.ring.material) {
      entry.ring.material.opacity = 0;
    }
    entry.ring.scale.setScalar(DYNAMIC_MEMORY_RING_MIN_RADIUS);
  }
}

function disposeDynamicMemory(zombie) {
  const entry = dynamicMemory.get(zombie);
  if (!entry) {
    return;
  }
  if (entry.outline) {
    if (entry.outline.parent) {
      entry.outline.parent.remove(entry.outline);
    }
    disposeMeshResources(entry.outline);
  }
  if (entry.ring) {
    if (entry.ring.parent) {
      entry.ring.parent.remove(entry.ring);
    }
    disposeMeshResources(entry.ring);
  }
  dynamicMemory.delete(zombie);
}

function clearAllMemories() {
  staticMemory.forEach((entry) => {
    if (entry.ghost && entry.ghost.parent) {
      entry.ghost.parent.remove(entry.ghost);
    }
    if (entry.ghost) {
      disposeMeshResources(entry.ghost, { disposeGeometry: false });
    }
  });
  staticMemory.clear();

  dynamicMemory.forEach((entry) => {
    if (entry.outline && entry.outline.parent) {
      entry.outline.parent.remove(entry.outline);
    }
    if (entry.outline) {
      disposeMeshResources(entry.outline);
    }
    if (entry.ring && entry.ring.parent) {
      entry.ring.parent.remove(entry.ring);
    }
    if (entry.ring) {
      disposeMeshResources(entry.ring);
    }
  });
  dynamicMemory.clear();
}

function easeOutCubic(t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const inv = 1 - clamped;
  return 1 - inv * inv * inv;
}

function updateFieldOfView() {
  if (!groundTiles) {
    return;
  }

  if (!player || !player.userData || !player.userData.viewDirection) {
    resetFieldOfViewVisibility();
    return;
  }

  const forward = scratchVec3.copy(player.userData.viewDirection);
  if (forward.lengthSq() < 1e-6) {
    resetFieldOfViewVisibility();
    return;
  }
  forward.normalize();

  const originX = player.position.x;
  const originZ = player.position.z;
  const now = performance.now();

  const isWithinFov = (position) => {
    scratchVec1.set(position.x - originX, 0, position.z - originZ);
    const distSq = scratchVec1.lengthSq();
    if (distSq < 1e-4) {
      return true;
    }
    scratchVec1.normalize();
    return scratchVec1.dot(forward) >= PLAYER_FOV_COS;
  };

  groundTiles.children.forEach((tile) => {
    tile.visible = isWithinFov(tile.position);
  });

  obstacles.forEach((obstacle) => {
    const visible = isWithinFov(obstacle.position);
    updateStaticMemoryVisibility(obstacle, visible, now);
  });

  zombies.forEach((zombie) => {
    const visible = isWithinFov(zombie.mesh.position);
    updateDynamicMemoryVisibility(zombie, visible, now);
    const panel = zombieDebugPanels.get(zombie);
    if (panel) {
      panel.style.visibility = visible ? "visible" : "hidden";
    }
  });

  noiseVisuals.forEach((entry) => {
    if (entry.mesh) {
      entry.mesh.visible = isWithinFov(entry.mesh.position);
    }
  });

  sandboxLights.forEach((entry) => {
    if (entry.light) {
      entry.light.visible = isWithinFov(entry.light.position);
    }
    if (entry.helper) {
      entry.helper.visible = isWithinFov(entry.helper.position);
    }
  });
}

function updateZombies(dt) {
  if (zombies.length === 0) {
    return;
  }

  const hasPlayer = Boolean(player);

  zombies.forEach((zombie) => {
    const { mesh } = zombie;
    if (zombie.isDocile) {
      zombie.state = "idle";
      zombie.reason = "Docile testing dummy";
      zombie.currentStimulus = null;
      zombie.lastStimulusType = null;
      zombie.debugTarget = "None";
      updateZombieDebugEntry(zombie);
      positionZombieBubble(zombie);
      return;
    }
    const previousPosition = mesh.position.clone();
    pruneZombieLightMemory(zombie);
    pruneZombieNoiseMemory(zombie);
    const distanceToPlayer = hasPlayer ? mesh.position.distanceTo(player.position) : Infinity;
    const toPlayer = hasPlayer
      ? new THREE.Vector3().subVectors(player.position, mesh.position)
      : new THREE.Vector3();
    const playerInSight =
      hasPlayer &&
      !isGameOver &&
      distanceToPlayer < zombie.detectRange &&
      hasLineOfSight(mesh.position, player.position);

    if (playerInSight) {
      if (zombie.state !== "chasing") {
        setZombieState(
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
      (!hasPlayer || isGameOver || distanceToPlayer > zombie.detectRange * 1.8 || !playerInSight)
    ) {
      const investigateTarget = hasPlayer ? player.position.clone() : mesh.position.clone();
      setZombieState(
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

    let stimulus = null;
    if (!isGameOver) {
      stimulus = findStimulusForZombie(zombie);
    }

    const canReactToStimulus =
      stimulus &&
      (zombie.state !== "chasing" ||
        !playerInSight ||
        (stimulus.type === "noise" &&
          (!hasPlayer || distanceToPlayer > zombie.attackRadius * 3 || Math.random() < 0.45)));

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

    zombie.decisionTimer -= dt;
    const movementDir = new THREE.Vector3();
    let moveSpeed = zombie.wanderSpeed;

    switch (zombie.state) {
      case "chasing": {
        if (hasPlayer) {
          toPlayer.y = 0;
          if (toPlayer.lengthSq() > 0.01) {
            toPlayer.normalize();
            movementDir.copy(toPlayer);
            moveSpeed = zombie.speed;
          }
        } else {
          setZombieState(
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
          if (investigatingLight && !isGameOver) {
            zombie.investigateTimer = THREE.MathUtils.randFloat(1.5, 3);
            zombie.reason = "Lingering at light source";
            zombie.lastStimulusType = null;
          } else {
            setZombieState(
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
          zombie.wanderTarget = randomPointNear(mesh.position, 7);
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

    clampToWorld(mesh.position);
    handleObstacleCollisions(mesh, previousPosition);

    if (hasPlayer && !isGameOver) {
      const newDistanceToPlayer = mesh.position.distanceTo(player.position);
      if (newDistanceToPlayer < zombie.attackRadius) {
        player.userData.onDamage(zombie.damage * dt);
        zombie.reason = `Feeding (${newDistanceToPlayer.toFixed(2)}m)`;
      }
    }

    updateZombieDebugEntry(zombie);
    positionZombieBubble(zombie);
  });
}

function createPlayer() {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x57c2ff, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), bodyMaterial);
  body.position.set(0, 1, 0);

  body.castShadow = true;
  body.receiveShadow = true;
  body.userData = {
    speed: 7,
    health: 100,
    footstepCooldown: 0,
    viewDirection: new THREE.Vector3(0, 0, 1),
    onDamage: (amount) => {
      body.userData.health = Math.max(body.userData.health - amount, 0);
      healthEl.textContent = `Health: ${body.userData.health.toFixed(0)}`;
      if (body.userData.health <= 0) {
        isGameOver = true;
        healthEl.textContent = "Health: 0 (Down!)";
      }
      return amount;
    },
  };

  return body;
}

function spawnZombie(options = {}) {
  if (!worldRoot) {
    return null;
  }

  const behavior = options.behavior ?? "aggressive";
  const isDocile = behavior === "docile";
  const mesh = new THREE.Mesh(zombieGeometry, zombieMaterial.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (isDocile) {
    mesh.material.color.setHex(0x76c18f);
    if (mesh.material.emissive) {
      mesh.material.emissive.setHex(0x1a3c24);
    }
    mesh.material.emissiveIntensity = 0.25;
  }

  const spawnPos =
    options.position ??
    new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(world.size * 0.75),
      1,
      THREE.MathUtils.randFloatSpread(world.size * 0.75)
    );
  const safeSpawn = findOpenPosition(spawnPos, 0.6);
  mesh.position.copy(safeSpawn);

  const zombie = {
    id: ++zombieIdCounter,
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
    noiseMemory: new Map()
  };

  zombies.push(zombie);
  worldRoot.add(mesh);
  createZombieDebugPanel(zombie);
  updateSandboxStatus();
  return zombie;
}

function createZombieDebugPanel(zombie) {
  if (!debugPanelsContainer || currentMode !== "sandbox") {
    zombieDebugPanels.set(zombie, null);
    return;
  }
  const panel = document.createElement("div");
  panel.className = "thought-bubble";
  panel.dataset.zombieId = String(zombie.id);
  zombieDebugPanels.set(zombie, panel);
  debugPanelsContainer.appendChild(panel);
  updateZombieDebugEntry(zombie);
  positionZombieBubble(zombie);
}

function removeZombieDebugPanel(zombie) {
  const panel = zombieDebugPanels.get(zombie);
  if (panel && panel.parentElement) {
    panel.style.display = "none";
    panel.parentElement.removeChild(panel);
  }
  zombieDebugPanels.delete(zombie);
}

function updateZombieDebugEntry(zombie) {
  const panel = zombieDebugPanels.get(zombie);
  if (!panel) {
    return;
  }
  const state = zombie.state;
  const reason = zombie.reason || "Idle";
  const distanceToPlayer =
    player && player.position
      ? `${zombie.mesh.position.distanceTo(player.position).toFixed(1)}m`
      : "n/a";
  const stimulusLabel = getStimulusLabel(zombie);
  const targetLabel = getTargetLabel(zombie);

  panel.innerHTML = `
    <div class="state">${state.toUpperCase()}</div>
    <div class="reason">${reason}</div>
    <div class="meta">Stimulus: ${stimulusLabel}</div>
    <div class="meta">Target: ${targetLabel}</div>
    <div class="meta">Player Dist: ${distanceToPlayer}</div>
  `;
}

function createObstacles() {
  const obstacles = [];
  const material = new THREE.MeshStandardMaterial({ color: 0x383f45, roughness: 0.9 });
  const wallGeometry = new THREE.BoxGeometry(2, 2, 0.5);

  const wallsToCreate = 12;
  const minDistanceFromCenter = 6;
  const minDistanceBetweenWalls = 3;
  const maxAttemptsPerWall = 30;

  const samplePosition = () => {
    const biasEdge = Math.random() < 0.55;
    if (biasEdge) {
      const angle = Math.random() * Math.PI * 2;
      const radius = THREE.MathUtils.randFloat(
        world.half * 0.65,
        world.half * 0.95
      );
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        1,
        Math.sin(angle) * radius
      );
    }
    return new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(world.half * 1.1),
      1,
      THREE.MathUtils.randFloatSpread(world.half * 1.1)
    );
  };

  const isTooClose = (candidate) => {
    const distanceFromCenter = Math.hypot(candidate.x, candidate.z);
    if (distanceFromCenter < minDistanceFromCenter) {
      return true;
    }
    return obstacles.some((existing) =>
      existing.position.distanceTo(candidate) < minDistanceBetweenWalls
    );
  };

  for (let i = 0; i < wallsToCreate; i += 1) {
    let attempts = 0;
    let position = samplePosition();
    while (isTooClose(position) && attempts < maxAttemptsPerWall) {
      position = samplePosition();
      attempts += 1;
    }

    if (isTooClose(position)) {
      const direction = new THREE.Vector2(position.x, position.z);
      if (direction.lengthSq() === 0) {
        direction.set(1, 0);
      }
      direction.normalize().multiplyScalar(minDistanceFromCenter + 1.5);
      position.set(direction.x, 1, direction.y);
    }

    const wall = new THREE.Mesh(wallGeometry, material);
    wall.position.copy(position);
    clampToWorld(wall.position);
    wall.rotation.y =
      (i % 2 === 0 ? 0 : Math.PI / 2) + THREE.MathUtils.randFloatSpread(Math.PI / 6);
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.userData = wall.userData || {};
    wall.updateMatrixWorld(true);
    wall.userData.boundingBox = new THREE.Box3().setFromObject(wall);
    obstacles.push(wall);
  }

  return obstacles;
}

function createGround() {
  const tileGeometry = new THREE.PlaneGeometry(world.tileSize, world.tileSize);
  const tileMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a2027,
    roughness: 1,
    metalness: 0,
  });
  const floor = new THREE.Group();

  const tilesPerSide = world.size;
  const offset = (tilesPerSide * world.tileSize) / 2;

  for (let x = 0; x < tilesPerSide; x += 1) {
    for (let z = 0; z < tilesPerSide; z += 1) {
      const tile = new THREE.Mesh(tileGeometry, tileMaterial.clone());
      const altColor = (x + z) % 2 === 0 ? 0x1f2830 : 0x171d24;
      tile.material.color.setHex(altColor);
      tile.rotation.x = -Math.PI / 2;
      tile.receiveShadow = true;
      tile.position.set(
        x * world.tileSize - offset + world.tileSize / 2,
        0,
        z * world.tileSize - offset + world.tileSize / 2
      );
      floor.add(tile);
    }
  }

  return floor;
}

function createLights() {
  const group = new THREE.Group();

  ambientLight = new THREE.AmbientLight(0x304150, 0.6);
  group.add(ambientLight);

  sunLight = new THREE.DirectionalLight(0xfff1c4, 1.2);
  sunLight.position.set(SUN_ORBIT_RADIUS * 0.8, SUN_ORBIT_HEIGHT * 0.6, SUN_ORBIT_DEPTH);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 90;
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  sunLight.target.position.set(0, 0, 0);
  group.add(sunLight);
  group.add(sunLight.target);

  moonLight = new THREE.DirectionalLight(
    currentAtmospherePreset ? currentAtmospherePreset.moonColor : 0xaabbee,
    0.4
  );
  moonLight.position.set(-SUN_ORBIT_RADIUS * 0.6, MOON_ORBIT_HEIGHT * 0.7, MOON_ORBIT_DEPTH);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.near = 0.5;
  moonLight.shadow.camera.far = 90;
  moonLight.shadow.camera.left = -28;
  moonLight.shadow.camera.right = 28;
  moonLight.shadow.camera.top = 28;
  moonLight.shadow.camera.bottom = -28;
  moonLight.target.position.set(0, 0, 0);
  group.add(moonLight);
  group.add(moonLight.target);

  const lampColor = 0xff6b3d;
  const lamps = [
    new THREE.SpotLight(lampColor, 0.6, 20, Math.PI / 6, 0.4, 1),
    new THREE.SpotLight(lampColor, 0.5, 20, Math.PI / 6, 0.6, 1),
  ];

  lamps[0].position.set(-6, 6, -4);
  lamps[1].position.set(9, 6, 8);
  lamps.forEach((lamp) => {
    lamp.castShadow = true;
    lamp.target.position.set(lamp.position.x, 0, lamp.position.z);
    group.add(lamp);
    group.add(lamp.target);
    lightSources.push({
      id: `static-${lightSources.length}`,
      position: new THREE.Vector3(lamp.position.x, 0, lamp.position.z),
      strength: lamp.intensity * 10,
      radius: lamp.distance * 0.75,
      type: "light",
      dynamic: false,
      isWorldLight: true
    });
    lamp.userData.isWorldLight = true;
  });

  return group;
}

function resizeRenderer() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);

  const aspect = width / height;
  camera.left = -cameraFrustum * aspect;
  camera.right = cameraFrustum * aspect;
  camera.top = cameraFrustum;
  camera.bottom = -cameraFrustum;
  camera.updateProjectionMatrix();
  updateAllZombieBubblePositions();
}

function updateCamera() {
  const focusSource = player ? player.position : defaultFocus;
  scratchVec1.copy(focusSource);
  scratchVec1.y = 0;

  const distance = player ? 38 : 34;
  const height = Math.sin(isoTilt) * distance;
  const planarDistance = Math.cos(isoTilt) * distance;

  const offsetX = Math.cos(isoRotation) * planarDistance;
  const offsetZ = Math.sin(isoRotation) * planarDistance;

  camera.position.set(
    scratchVec1.x + offsetX,
    scratchVec1.y + height,
    scratchVec1.z + offsetZ
  );
  camera.lookAt(scratchVec1);
}

function updateDayNightCycle(dt) {
  if (!sunLight || !moonLight || !ambientLight || !currentAtmospherePreset) {
    return;
  }

  dayNightCycle.time =
    (dayNightCycle.time + dt * dayNightCycle.speedMultiplier) % dayNightCycle.duration;
  const phase = dayNightCycle.time / dayNightCycle.duration;
  const sunAngle = phase * Math.PI * 2;
  const sunHeight = Math.sin(sunAngle);
  const sunBlend = THREE.MathUtils.clamp((sunHeight + 0.15) / 1.15, 0, 1);
  dayNightCycle.cachedBlend = sunBlend;

  const sunX = Math.cos(sunAngle) * SUN_ORBIT_RADIUS;
  const sunY = Math.max(sunHeight * SUN_ORBIT_HEIGHT, -8);
  sunLight.position.set(sunX, sunY, SUN_ORBIT_DEPTH);
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();

  const sunWarmFactor = THREE.MathUtils.clamp((sunHeight + 0.05) / 0.7, 0, 1);
  sunLight.color
    .copy(scratchColor1.setHex(currentAtmospherePreset.sunsetSunColor))
    .lerp(scratchColor2.setHex(currentAtmospherePreset.daySunColor), sunWarmFactor);
  sunLight.intensity = THREE.MathUtils.lerp(0.05, 1.35, sunBlend);

  const moonAngle = sunAngle + Math.PI;
  const moonHeight = Math.sin(moonAngle);
  const nightFactor = 1 - sunBlend;
  const moonX = Math.cos(moonAngle) * MOON_ORBIT_RADIUS;
  const moonY = Math.max(moonHeight * MOON_ORBIT_HEIGHT, -6);
  moonLight.position.set(moonX, moonY, MOON_ORBIT_DEPTH);
  moonLight.target.position.set(0, 0, 0);
  moonLight.target.updateMatrixWorld();
  moonLight.color.setHex(currentAtmospherePreset.moonColor);
  moonLight.intensity = THREE.MathUtils.lerp(0, 0.6, nightFactor);

  const ambientNightColor = scratchColor1.setHex(currentAtmospherePreset.nightAmbientColor);
  const ambientDayColor = scratchColor2.setHex(currentAtmospherePreset.dayAmbientColor);
  ambientLight.color.copy(ambientNightColor).lerp(ambientDayColor, sunBlend);
  ambientLight.intensity = THREE.MathUtils.lerp(0.28, 1.0, sunBlend);

  updateEnvironmentForBlend(sunBlend);
}

function updateEnvironmentForBlend(blend) {
  if (!currentAtmospherePreset) {
    return;
  }
  if (!scene.fog) {
    scene.fog = new THREE.FogExp2(currentAtmospherePreset.nightFogColor, 0.02);
  }

  const fogNightColor = scratchColor1.setHex(currentAtmospherePreset.nightFogColor);
  const fogDayColor = scratchColor2.setHex(currentAtmospherePreset.dayFogColor);
  scene.fog.color.copy(fogNightColor).lerp(fogDayColor, blend);
  scene.fog.density = THREE.MathUtils.lerp(
    currentAtmospherePreset.nightFogDensity,
    currentAtmospherePreset.dayFogDensity,
    blend
  );

  scratchColor1.setHex(currentAtmospherePreset.nightClearColor);
  scratchColor2.setHex(currentAtmospherePreset.dayClearColor);
  scratchColor3.copy(scratchColor1).lerp(scratchColor2, blend);
  renderer.setClearColor(scratchColor3.getHex(), 1);

  updateGroundTilesForBlend(blend);
}

function updateGroundTilesForBlend(blend) {
  if (!groundTiles || !currentAtmospherePreset) {
    return;
  }
  groundTiles.children.forEach((tile, index) => {
    const nightHex =
      index % 2 === 0
        ? currentAtmospherePreset.nightTileColorA
        : currentAtmospherePreset.nightTileColorB;
    const dayHex =
      index % 2 === 0
        ? currentAtmospherePreset.dayTileColorA
        : currentAtmospherePreset.dayTileColorB;
    const nightColor = scratchColor1.setHex(nightHex);
    const dayColor = scratchColor2.setHex(dayHex);
    tile.material.color.copy(nightColor).lerp(dayColor, blend);
  });
}

function updateStimuli(dt) {
  for (let i = stimuli.length - 1; i >= 0; i -= 1) {
    const stimulus = stimuli[i];
    stimulus.ttl -= dt;
    stimulus.strength = Math.max(0, stimulus.strength - stimulus.fadeRate * dt);
    if (stimulus.ttl <= 0 || stimulus.strength <= 0.1) {
      stimuli.splice(i, 1);
      continue;
    }
  }

  for (let i = sandboxLights.length - 1; i >= 0; i -= 1) {
    const entry = sandboxLights[i];
    entry.ttl -= dt;
    if (entry.light) {
      const flicker = 0.75 + Math.random() * 0.45;
      entry.light.intensity = entry.baseIntensity * flicker;
    }
    if (entry.helper) {
      entry.helper.material.opacity = Math.max(0, entry.ttl / entry.initialTtl);
    }
    if (entry.ttl <= 0) {
      if (entry.light) {
        scene.remove(entry.light);
        if (typeof entry.light.dispose === "function") {
          entry.light.dispose();
        }
      }
      if (entry.helper && entry.helper.parent) {
        entry.helper.parent.remove(entry.helper);
      }
      if (entry.helper) {
        disposeMeshResources(entry.helper);
      }
      const sourceIndex = lightSources.findIndex(
        (source) => source.dynamic && source.id === entry.id
      );
      if (sourceIndex >= 0) {
        lightSources.splice(sourceIndex, 1);
      }
      sandboxLights.splice(i, 1);
    }
  }

  //This makes the ring grow and fade each frame until it dissapears
  for (let i = noiseVisuals.length - 1; i >= 0; i -= 1) {
    const entry = noiseVisuals[i];
    entry.vttl -= dt;

    const lifeRatio = 1 - Math.max(0, entry.vttl) / entry.initialVttl; // 0ÔåÆ1 over visual lifetime
    const currentRadius = THREE.MathUtils.lerp(0.001, entry.maxRadius, lifeRatio);
    entry.mesh.scale.set(currentRadius, currentRadius, 1);

    entry.mesh.material.opacity = Math.max(0, entry.vttl / entry.initialVttl) * 0.75;

    if (entry.vttl <= 0) {
      if (entry.mesh.parent) entry.mesh.parent.remove(entry.mesh);
      disposeMeshResources(entry.mesh);
      noiseVisuals.splice(i, 1);
    }
  }

  for (const stimulus of stimuli) {
    if (stimulus.type !== "noise") continue;

    stimulus.ringLife = Math.min(stimulus.ringTtl, (stimulus.ringLife ?? 0) + dt);
    stimulus.prevRadius = stimulus.currentRadius;
    const lifeRatio = stimulus.ringTtl > 0 ? (stimulus.ringLife / stimulus.ringTtl) : 1;
    stimulus.currentRadius = THREE.MathUtils.lerp(0, stimulus.visualRadius, lifeRatio);

    if (stimulus.prevRadius >= stimulus.currentRadius) continue;

    for (const z of zombies) {
      if (isGameOver) break;
      if (stimulus.hit.has(z.id)) continue;

      const dist = z.mesh.position.distanceTo(stimulus.position);

      if (stimulus.prevRadius < dist && dist <= stimulus.currentRadius) {
        const key = stimulus.emitterId ?? stimulus.id;
        const now = performance.now();
        const mem = z.noiseMemory.get(key);

        const NOISE_RECALL_COOLDOWN_MS = 10000;

        if (mem && now < mem.cooldownUntil) {
          stimulus.hit.add(z.id);
          continue;
        }

        const allow = (z.state !== "chasing");
        if (allow) {
          const linger = THREE.MathUtils.randFloat(2.5, 4.5);
          setZombieState(
            z,
            "investigating",
            stimulus.position.clone(),
            linger,
            "Heard expanding noise ring",
            stimulus.id
          );
          z.lastStimulusType = "noise";
          z.currentStimulus = "noise";
          z.debugTarget = "Noise origin";
        }

        z.noiseMemory.set(key, {
          cooldownUntil: now + NOISE_RECALL_COOLDOWN_MS,
          lastHeard: now,
        });

        stimulus.hit.add(z.id);
      }

    }
  }
}

//Createnoise will create a visual ripple expanding outwards
//The ripple size can be increased if the noise should be visually louder.
function createNoise(position, strength, radius, ttl = 2, visual = {}) {
  const speed = visual.speed ?? NOISE_RIPPLE_SPEED_MULTIPLIER;
  const visualRadius = visual.visualRadius ?? radius;
  const visualTtl = ttl / Math.max(0.001, speed);

  const stim = {
    id: `noise-${stimulusIdCounter++}`,
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
    hit: new Set(),
  };
  stimuli.push(stim);

  const id = `noisevis-${performance.now()}-${Math.random().toString(16).slice(2)}`;
  const ringGeometry = new THREE.RingGeometry(0.95, 1.0, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x66aaff, transparent: true, opacity: 0.75,
    side: THREE.DoubleSide, depthWrite: false, depthTest: false, fog: true,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, 0.051, position.z);
  ring.scale.set(0.001, 0.001, 1);
  ring.renderOrder = 2;
  (worldRoot ?? scene).add(ring);

  noiseVisuals.push({
    id,
    mesh: ring,
    vttl: visualTtl,
    initialVttl: visualTtl,
    maxRadius: visualRadius,
  });

  updateSandboxStatus();
}

function createSandboxLight(point, options = {}) {
  const ttl = options.ttl ?? 12;
  const intensity = options.intensity ?? 1.6;
  const radius = options.radius ?? 10;

  const light = new THREE.PointLight(0xffa560, intensity, radius, 1.8);
  light.position.set(point.x, 4, point.z);
  scene.add(light);

  const helper = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa560, transparent: true, opacity: 0.95 })
  );
  helper.position.set(point.x, 1.1, point.z);
  if (worldRoot) {
    worldRoot.add(helper);
  }

  const id = `dynamic-${performance.now()}-${Math.random().toString(16).slice(2)}`;
  lightSources.push({
    id,
    position: new THREE.Vector3(point.x, 0, point.z),
    strength: intensity * 10,
    radius: radius,
    type: "light",
    dynamic: true,
  });

  sandboxLights.push({
    id,
    light,
    helper,
    ttl,
    initialTtl: ttl,
    baseIntensity: intensity,
  });
  updateSandboxStatus();
}

function findStimulusForZombie(zombie) {
  const position = zombie.mesh.position;
  const lightWeight = 1.6;

  let bestStimulus = null;
  let bestScore = 0;

  stimuli.forEach((stimulus) => {
    if (stimulus.type !== "light") return;
    const distance = position.distanceTo(stimulus.position);
    if (distance > stimulus.radius) return;

    const falloff = 0.35;
    const score = (stimulus.strength * lightWeight) / (1 + distance * falloff);
    if (score > bestScore) {
      bestScore = score;
      bestStimulus = stimulus;
    }
  });

  lightSources.forEach((light) => {
    if (light.isWorldLight) return;
    const distance = position.distanceTo(light.position);
    if (distance > light.radius) return;
    const flicker = 0.9 + Math.random() * 0.25;
    const score = (light.strength * lightWeight * flicker) / (1 + distance * 0.32);
    if (score > bestScore) {
      bestScore = score;
      bestStimulus = {
        id: light.id,
        position: light.position.clone(),
        strength: light.strength,
        radius: light.radius,
        type: light.type,
      };
    }
  });

  return bestStimulus;
}



function placePlayer(position) {
  if (!worldRoot) {
    return null;
  }
  if (!player) {
    player = createPlayer();
    worldRoot.add(player);
    isGameOver = false;
  }
  const safePosition = findOpenPosition(position, 0.65);
  player.position.copy(safePosition);
  if (player.userData) {
    player.userData.health = 100;
    player.userData.footstepCooldown = 0;
    if (player.userData.viewDirection) {
      player.userData.viewDirection.set(0, 0, 1);
    }
  }
  player.rotation.y = 0;
  healthEl.textContent = `Health: ${player.userData.health.toFixed(0)}`;
  updateSandboxStatus();
  return player;
}

function removeZombie(zombie) {
  const index = zombies.indexOf(zombie);
  if (index === -1) {
    return false;
  }
  if (zombie.mesh && zombie.mesh.parent) {
    zombie.mesh.parent.remove(zombie.mesh);
  }
  if (zombie.mesh) {
    disposeMeshResources(zombie.mesh, { disposeGeometry: false });
  }
  disposeDynamicMemory(zombie);
  removeZombieDebugPanel(zombie);
  zombies.splice(index, 1);
  updateSandboxStatus();
  return true;
}

function removeAllZombies() {
  const count = zombies.length;
  while (zombies.length > 0) {
    removeZombie(zombies[0]);
  }
  return count;
}

function removeNearestZombie(point, radius = 2.5) {
  let closest = null;
  let bestDistance = radius;
  zombies.forEach((zombie) => {
    const distance = zombie.mesh.position.distanceTo(point);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = zombie;
    }
  });
  if (closest) {
    removeZombie(closest);
    return true;
  }
  return false;
}

function applyAtmosphere(mode) {
  if (!scene.fog) {
    scene.fog = new THREE.FogExp2(0x1a2129, 0.02);
  }
  atmosphereState = mode;
  currentAtmospherePreset = atmospherePresets[mode] || atmospherePresets.dark;
  if (moonLight) {
    moonLight.color.setHex(currentAtmospherePreset.moonColor);
  }
  if (sunLight) {
    sunLight.color.setHex(currentAtmospherePreset.daySunColor);
  }
  updateEnvironmentForBlend(dayNightCycle.cachedBlend);
}

function setZombieState(zombie, state, target = null, timer = null, reason = "", stimulusId = null) {
  zombie.state = state;
  zombie.reason = reason || zombie.reason || "Standing by";
  zombie.activeStimulusId = stimulusId ?? null;
  switch (state) {
    case "chasing":
      zombie.target = null;
      zombie.wanderTarget = null;
      zombie.investigateTimer = 0;
      zombie.decisionTimer = THREE.MathUtils.randFloat(0.5, 1.5);
      zombie.currentStimulus = "vision";
      zombie.debugTarget = "Player";
      break;
    case "investigating":
      zombie.target = target;
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
      zombie.wanderTarget = target ?? randomPointInWorld();
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

function clampToWorld(position) {
  position.x = THREE.MathUtils.clamp(position.x, -world.half + 1, world.half - 1);
  position.z = THREE.MathUtils.clamp(position.z, -world.half + 1, world.half - 1);
}

function randomPointInWorld() {
  return new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(world.size - 4),
    1,
    THREE.MathUtils.randFloatSpread(world.size - 4)
  );
}

function randomPointNear(origin, radius = 6) {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius;
  const point = new THREE.Vector3(
    origin.x + Math.cos(angle) * distance,
    1,
    origin.z + Math.sin(angle) * distance
  );
  clampToWorld(point);
  return point;
}

function handleObstacleCollisions(entity, previousPosition) {
  const entityBox = new THREE.Box3().setFromObject(entity);
  for (const obstacle of obstacles) {
    const obstacleBox = new THREE.Box3().setFromObject(obstacle);
    if (entityBox.intersectsBox(obstacleBox)) {
      if (previousPosition) {
        entity.position.copy(previousPosition);
      }
      entityBox.setFromObject(entity);
      break;
    }
  }
}

function updatePointerNdcFromEvent(event) {
  pointerNdc.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
}

function computeGroundIntersection(target) {
  if (!groundTiles) {
    return false;
  }

  raycaster.setFromCamera(pointerNdc, camera);
  const { origin, direction } = raycaster.ray;
  const epsilon = 1e-5;
  if (Math.abs(direction.y) < epsilon) {
    return false;
  }

  const distanceToPlane = -origin.y / direction.y;
  if (distanceToPlane < 0) {
    return false;
  }

  target.copy(direction).multiplyScalar(distanceToPlane).add(origin);
  target.y = 0;
  clampToWorld(target);
  return true;
}

function refreshPointerAim() {
  if (!hasPointerAim) {
    return;
  }
  if (!computeGroundIntersection(pointerAim)) {
    hasPointerAim = false;
  }
}

function handlePointerMove(event) {
  updatePointerNdcFromEvent(event);
  hasPointerAim = computeGroundIntersection(pointerAim);
}

function handlePointerDown(event) {
  updatePointerNdcFromEvent(event);
  const pointerUpdated = computeGroundIntersection(pointerAim);
  hasPointerAim = pointerUpdated;
  if (event.button !== 0 || !isInitialized || currentMode !== "sandbox" || !sandboxTool) {
    return;
  }

  if (!pointerUpdated) {
    return;
  }
  const point = pointerAim.clone();

  switch (sandboxTool) {
    case "player":
      placePlayer(new THREE.Vector3(point.x, 1, point.z));
      break;
    case "zombie":
      spawnZombie({ position: new THREE.Vector3(point.x, 1, point.z) });
      break;
    case "dev-zombie":
      spawnZombie({
        position: new THREE.Vector3(point.x, 1, point.z),
        behavior: "docile",
      });
      break;
    case "noise":
      createNoise(new THREE.Vector3(point.x, 1, point.z), 18, 14, 6, { visualRadius: CLICK_NOISE_VISUAL_RADIUS });
      break;
    case "light":
      createSandboxLight(point, { ttl: 14, intensity: 1.8, radius: 12 });
      break;
    case "remove": {
      const success = removeNearestZombie(new THREE.Vector3(point.x, 1, point.z), 3);
      if (!success) {
        showModeInfo("No zombie close enough to remove at that point.", 1600);
      }
      break;
    }
    default:
      break;
  }
}

function getGroundIntersection(event) {
  if (event) {
    updatePointerNdcFromEvent(event);
  }
  if (!computeGroundIntersection(scratchVec2)) {
    return null;
  }
  return scratchVec2.clone();
}

function setSandboxTool(tool) {
  sandboxTool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === sandboxTool);
  });
}

function updateSandboxStatus() {
  if (!devStatus) {
    return;
  }
  const playerStatus = player ? "present" : "none";
  const cycleLabel = dayNightCycle.accelerated ? "fast" : "normal";
  const docileCount = zombies.filter((zombie) => zombie.isDocile).length;
  const activeCount = zombies.length - docileCount;
  devStatus.textContent = `Player: ${playerStatus} | Zombies: ${activeCount} | Docile: ${docileCount} | Noise: ${stimuli.length} | Lights: ${sandboxLights.length} | DayCycle: ${cycleLabel}`;
}

function clearTransientStimuli() {
  stimuli.length = 0;
  for (let i = sandboxLights.length - 1; i >= 0; i -= 1) {
    const entry = sandboxLights[i];
    if (entry.light) {
      scene.remove(entry.light);
      if (typeof entry.light.dispose === "function") {
        entry.light.dispose();
      }
    }
    if (entry.helper && entry.helper.parent) {
      entry.helper.parent.remove(entry.helper);
    }
    if (entry.helper) {
      disposeMeshResources(entry.helper);
    }
    sandboxLights.splice(i, 1);
  }
  for (let i = lightSources.length - 1; i >= 0; i -= 1) {
    if (lightSources[i].dynamic) {
      lightSources.splice(i, 1);
    }
  }

  for (let i = noiseVisuals.length - 1; i >= 0; i -= 1) {
    const entry = noiseVisuals[i];
    if (entry.mesh?.parent) entry.mesh.parent.remove(entry.mesh);
    disposeMeshResources(entry.mesh);
  }
  noiseVisuals.length = 0;

  updateSandboxStatus();
}

let infoTimeout = null;
function showModeInfo(message, duration = 3000) {
  modeInfo.textContent = message;
  modeInfo.classList.remove("hidden");
  if (infoTimeout) {
    clearTimeout(infoTimeout);
  }
  infoTimeout = setTimeout(() => {
    modeInfo.classList.add("hidden");
  }, duration);
}

function getStimulusLabel(zombie) {
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

function getTargetLabel(zombie) {
  if (zombie.debugTarget && zombie.debugTarget !== "None") {
    return zombie.debugTarget;
  }
  if (zombie.state === "chasing" && player) {
    return "Player";
  }
  const targetVector = zombie.target || zombie.wanderTarget;
  if (targetVector) {
    return `(${targetVector.x.toFixed(1)}, ${targetVector.z.toFixed(1)})`;
  }
  return "None";
}

function positionZombieBubble(zombie) {
  const panel = zombieDebugPanels.get(zombie);
  if (!panel) {
    return;
  }
  bubbleProjection.copy(zombie.mesh.position).add(bubbleOffset).project(camera);
  const isVisible = bubbleProjection.z > -1 && bubbleProjection.z < 1;
  if (!isVisible) {
    panel.style.display = "none";
    return;
  }
  const screenX = (bubbleProjection.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-bubbleProjection.y * 0.5 + 0.5) * window.innerHeight;
  panel.style.display = "block";
  panel.style.left = `${screenX}px`;
  panel.style.top = `${screenY}px`;
}

function updateAllZombieBubblePositions() {
  if (currentMode !== "sandbox") {
    return;
  }
  zombies.forEach((zombie) => positionZombieBubble(zombie));
}

function getObstacleBounds(obstacle) {
  if (!obstacle) {
    return scratchBox.makeEmpty();
  }
  if (!obstacle.userData) {
    obstacle.userData = {};
  }
  if (!obstacle.userData.boundingBox) {
    obstacle.updateMatrixWorld(true);
    obstacle.userData.boundingBox = new THREE.Box3().setFromObject(obstacle);
  }
  return obstacle.userData.boundingBox;
}

function isPositionObstructed(position, radius = 0.6) {
  for (const obstacle of obstacles) {
    const bounds = getObstacleBounds(obstacle);
    scratchBox.copy(bounds).expandByScalar(radius);
    if (scratchBox.containsPoint(position)) {
      return true;
    }
  }
  return false;
}

function findOpenPosition(preferredPosition, radius = 0.6, attempts = 24) {
  scratchVec1.copy(preferredPosition);
  scratchVec1.y = 1;
  clampToWorld(scratchVec1);
  if (!isPositionObstructed(scratchVec1, radius)) {
    return scratchVec1.clone();
  }

  for (let i = 0; i < attempts; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = radius + 0.6 + Math.random() * 4;
    scratchVec2.set(
      preferredPosition.x + Math.cos(angle) * distance,
      1,
      preferredPosition.z + Math.sin(angle) * distance
    );
    clampToWorld(scratchVec2);
    if (!isPositionObstructed(scratchVec2, radius)) {
      return scratchVec2.clone();
    }
  }

  scratchVec2.set(0, 1, 0);
  if (!isPositionObstructed(scratchVec2, radius)) {
    return scratchVec2.clone();
  }

  return scratchVec1.clone();
}

function hasLineOfSight(fromPosition, toPosition) {
  scratchVec1.copy(fromPosition);
  scratchVec1.y += 0.8;
  scratchVec2.copy(toPosition);
  scratchVec2.y += 0.8;
  losRay.origin.copy(scratchVec1);
  losRay.direction.copy(scratchVec2).sub(scratchVec1);
  const distance = losRay.direction.length();
  if (distance <= 0.001) {
    return true;
  }
  losRay.direction.normalize();

  for (const obstacle of obstacles) {
    const bounds = getObstacleBounds(obstacle);
    scratchBox.copy(bounds).expandByScalar(0.15);
    const hitPoint = losRay.intersectBox(scratchBox, scratchVec3);
    if (hitPoint && losRay.origin.distanceTo(hitPoint) < distance - 0.25) {
      return false;
    }
  }

  return true;
}

function shouldInvestigateLight(zombie, stimulus) {
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
    existing.cooldownUntil = now + 10000;
    existing.returnChance = Math.max(existing.returnChance * 0.7, 0.2);
    zombie.lightMemory.set(stimulus.id, existing);
    return true;
  }

  const chance = existing.returnChance ?? 0.75;
  const shouldPursue = Math.random() < chance;
  existing.lastChecked = now;
  if (shouldPursue) {
    existing.cooldownUntil = now + 12000 + Math.random() * 4000;
    existing.returnChance = Math.max(chance * 0.6, 0.2);
  } else {
    existing.cooldownUntil = now + 5500 + Math.random() * 4500;
    existing.returnChance = Math.max(chance * 0.85, 0.25);
  }
  zombie.lightMemory.set(stimulus.id, existing);
  return shouldPursue;
}

function markLightInvestigationOutcome(zombie, reachedTarget) {
  if (!zombie.activeStimulusId || !zombie.lightMemory) {
    return;
  }
  const entry = zombie.lightMemory.get(zombie.activeStimulusId);
  if (!entry) {
    return;
  }
  const now = performance.now();
  entry.lastChecked = now;
  entry.cooldownUntil = now + (reachedTarget ? 15000 : 10000);
  entry.returnChance = Math.max((entry.returnChance ?? 0.5) * (reachedTarget ? 0.4 : 0.55), 0.15);
  zombie.lightMemory.set(zombie.activeStimulusId, entry);
}

function pruneZombieLightMemory(zombie) {
  if (!zombie.lightMemory || zombie.lightMemory.size === 0) {
    return;
  }
  const now = performance.now();
  zombie.lightMemory.forEach((entry, id) => {
    if (now - (entry.lastChecked ?? now) > 30000) {
      zombie.lightMemory.delete(id);
    }
  });
}

function pruneZombieNoiseMemory(zombie) {
  if (!zombie.noiseMemory || zombie.noiseMemory.size === 0) return;
  const now = performance.now();
  zombie.noiseMemory.forEach((entry, key) => {
    if (now - (entry.lastHeard ?? now) > NOISE_MEMORY_STALE_MS) {
      zombie.noiseMemory.delete(key);
    }
  });
}

