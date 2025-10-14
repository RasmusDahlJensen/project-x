import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

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
const debugPanelsContainer = document.getElementById("debug-panels");

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
const mouse = new THREE.Vector2();
const bubbleOffset = new THREE.Vector3(0, 2.6, 0);
const bubbleProjection = new THREE.Vector3();
const defaultFocus = new THREE.Vector3(0, 0, 0);
const losRay = new THREE.Ray();
const scratchBox = new THREE.Box3();
const scratchVec1 = new THREE.Vector3();
const scratchVec2 = new THREE.Vector3();
const scratchVec3 = new THREE.Vector3();

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

startSandboxBtn.addEventListener("click", () => bootstrap("sandbox"));
startGameBtn.addEventListener("click", () => bootstrap("game"));

spawnZombieBtn.addEventListener("click", () => {
  if (!isInitialized) {
    return;
  }
  const zombie = spawnZombie();
  if (zombie) {
    showModeInfo("Spawned an extra zombie.", 2000);
  }
});

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
  if (worldRoot) {
    scene.remove(worldRoot);
  }
  if (lightsGroup) {
    scene.remove(lightsGroup);
  }

  sandboxLights.forEach((entry) => {
    scene.remove(entry.light);
    if (entry.helper && entry.helper.parent) {
      entry.helper.parent.remove(entry.helper);
    }
  });

  stimuli.length = 0;
  lightSources.length = 0;
  sandboxLights.length = 0;
  zombies = [];
  obstacles = [];
  player = null;
  stimulusIdCounter = 0;
  worldRoot = null;
  lightsGroup = null;
  groundTiles = null;
  zombieDebugPanels.clear();
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

  if (isInitialized) {
    if (!isGameOver) {
      survivalTime += dt;
      statusTimeEl.textContent = `${survivalTime.toFixed(1)}s`;
    }

    updatePlayer(dt);
    updateStimuli(dt);
    updateZombies(dt);
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

  const previousPosition = player.position.clone();
  const moveDir = new THREE.Vector3();
  if (keys.has("KeyW")) moveDir.z -= 1;
  if (keys.has("KeyS")) moveDir.z += 1;
  if (keys.has("KeyA")) moveDir.x -= 1;
  if (keys.has("KeyD")) moveDir.x += 1;

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
      createNoise(player.position, 10 * intensity, 8 + intensity * 2, 2.4);
      player.userData.footstepCooldown = sprinting ? 0.32 : 0.52;
    }
    player.rotation.y = Math.atan2(moveDir.x, moveDir.z);
  } else {
    player.userData.footstepCooldown = Math.max(player.userData.footstepCooldown - dt, 0);
  }
}

function updateZombies(dt) {
  if (zombies.length === 0) {
    return;
  }

  const hasPlayer = Boolean(player);

  zombies.forEach((zombie) => {
    const { mesh } = zombie;
    const previousPosition = mesh.position.clone();
    pruneZombieLightMemory(zombie);
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

  const mesh = new THREE.Mesh(zombieGeometry, zombieMaterial.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;

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
    wanderTarget: null,
    target: null,
    wanderSpeed: 2.1,
    investigateSpeed: 2.8,
    speed: 3.6,
    detectRange: 12,
    attackRadius: 1.3,
    damage: 30,
    decisionTimer: THREE.MathUtils.randFloat(1, 2.5),
    investigateTimer: 0,
    lastStimulusType: null,
    reason: "Standing by",
    currentStimulus: null,
    debugTarget: "None",
    activeStimulusId: null,
    lightMemory: new Map(),
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

  for (let i = 0; i < 10; i += 1) {
    const wall = new THREE.Mesh(wallGeometry, material);
    wall.position.set(
      THREE.MathUtils.randFloatSpread(world.size * 0.6),
      1,
      THREE.MathUtils.randFloatSpread(world.size * 0.6)
    );
    wall.rotation.y = i % 2 === 0 ? 0 : Math.PI / 2;
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

  moonLight = new THREE.DirectionalLight(0xaabbee, 0.8);
  moonLight.position.set(-20, 25, -20);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.near = 0.5;
  moonLight.shadow.camera.far = 80;
  moonLight.shadow.camera.left = -25;
  moonLight.shadow.camera.right = 25;
  moonLight.shadow.camera.top = 25;
  moonLight.shadow.camera.bottom = -25;
  group.add(moonLight);

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

function updateStimuli(dt) {
  for (let i = stimuli.length - 1; i >= 0; i -= 1) {
    const stimulus = stimuli[i];
    stimulus.ttl -= dt;
    stimulus.strength = Math.max(0, stimulus.strength - stimulus.fadeRate * dt);
    if (stimulus.ttl <= 0 || stimulus.strength <= 0.1) {
      stimuli.splice(i, 1);
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
      }
      if (entry.helper && entry.helper.parent) {
        entry.helper.parent.remove(entry.helper);
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
}

function createNoise(position, strength, radius, ttl = 2) {
  stimuli.push({
    id: `noise-${stimulusIdCounter++}`,
    position: position.clone(),
    strength,
    radius,
    ttl,
    type: "noise",
    fadeRate: strength / Math.max(ttl, 0.1),
  });

  //Visual noise effect

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
  const noiseWeight = 1;
  let bestStimulus = null;
  let bestScore = 0;

  stimuli.forEach((stimulus) => {
    const distance = position.distanceTo(stimulus.position);
    if (distance > stimulus.radius) {
      return;
    }
    const weight = stimulus.type === "light" ? lightWeight : noiseWeight;
    const falloff = stimulus.type === "light" ? 0.35 : 0.55;
    const score = (stimulus.strength * weight) / (1 + distance * falloff);
    if (score > bestScore) {
      bestScore = score;
      bestStimulus = stimulus;
    }
  });

  lightSources.forEach((light) => {
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
  }
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
  const brightenTiles = (baseA, baseB) => {
    if (!groundTiles) {
      return;
    }
    groundTiles.children.forEach((tile, index) => {
      const base = index % 2 === 0 ? baseA : baseB;
      tile.material.color.setHex(base);
    });
  };

  if (mode === "bright") {
    renderer.setClearColor(0x1b2631, 1);
    scene.fog.color.setHex(0x27323d);
    scene.fog.density = 0.02;
    if (ambientLight) {
      ambientLight.color.setHex(0x4a5c73);
      ambientLight.intensity = 0.95;
    }
    if (moonLight) {
      moonLight.color.setHex(0xe5f0ff);
      moonLight.intensity = 0.55;
    }
    brightenTiles(0x25313b, 0x1f2a33);
  } else {
    renderer.setClearColor(0x11151a, 1);
    scene.fog.color.setHex(0x0d1116);
    scene.fog.density = 0.035;
    if (ambientLight) {
      ambientLight.color.setHex(0x304150);
      ambientLight.intensity = 0.6;
    }
    if (moonLight) {
      moonLight.color.setHex(0xaabbee);
      moonLight.intensity = 0.8;
    }
    brightenTiles(0x1f2830, 0x171d24);
  }
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

function handlePointerDown(event) {
  if (event.button !== 0 || !isInitialized || currentMode !== "sandbox" || !sandboxTool) {
    return;
  }

  const point = getGroundIntersection(event);
  if (!point) {
    return;
  }

  switch (sandboxTool) {
    case "player":
      placePlayer(new THREE.Vector3(point.x, 1, point.z));
      break;
    case "zombie":
      spawnZombie({ position: new THREE.Vector3(point.x, 1, point.z) });
      break;
    case "noise":
      createNoise(new THREE.Vector3(point.x, 1, point.z), 18, 14, 6);
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
  if (!groundTiles) {
    return null;
  }

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(groundTiles.children, false);
  if (!intersects.length) {
    return null;
  }
  return intersects[0].point;
}

function setSandboxTool(tool) {
  sandboxTool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === sandboxTool);
  });
}

function updateSandboxStatus() {
  const playerStatus = player ? "present" : "none";
  devStatus.textContent = `Player: ${playerStatus} | Zombies: ${zombies.length} | Noise: ${stimuli.length} | Lights: ${sandboxLights.length}`;
}

function clearTransientStimuli() {
  stimuli.length = 0;
  for (let i = sandboxLights.length - 1; i >= 0; i -= 1) {
    const entry = sandboxLights[i];
    if (entry.light) {
      scene.remove(entry.light);
    }
    if (entry.helper && entry.helper.parent) {
      entry.helper.parent.remove(entry.helper);
    }
    sandboxLights.splice(i, 1);
  }
  for (let i = lightSources.length - 1; i >= 0; i -= 1) {
    if (lightSources[i].dynamic) {
      lightSources.splice(i, 1);
    }
  }
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
