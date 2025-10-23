import * as THREE from "three";

import {
  MOON_ORBIT_DEPTH,
  MOON_ORBIT_HEIGHT,
  MOON_ORBIT_RADIUS,
  SUN_ORBIT_DEPTH,
  SUN_ORBIT_HEIGHT,
  SUN_ORBIT_RADIUS,
} from "../config/constants.js";
import type { GameState } from "../types/game.js";

export function clampToWorld(state: GameState, position: THREE.Vector3): void {
  const half = state.world.half;
  position.x = THREE.MathUtils.clamp(position.x, -half + 1, half - 1);
  position.z = THREE.MathUtils.clamp(position.z, -half + 1, half - 1);
}

export function randomPointInWorld(state: GameState): THREE.Vector3 {
  const { size } = state.world;
  return new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(size - 4),
    1,
    THREE.MathUtils.randFloatSpread(size - 4)
  );
}

export function randomPointNear(state: GameState, origin: THREE.Vector3, radius = 6): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius;
  const point = new THREE.Vector3(
    origin.x + Math.cos(angle) * distance,
    1,
    origin.z + Math.sin(angle) * distance
  );
  clampToWorld(state, point);
  return point;
}

export function createGround(state: GameState): THREE.Group {
  const tileGeometry = new THREE.PlaneGeometry(state.world.tileSize, state.world.tileSize);
  const tileMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a2027,
    roughness: 1,
    metalness: 0,
  });
  const floor = new THREE.Group();

  const tilesPerSide = state.world.size;
  const offset = (tilesPerSide * state.world.tileSize) / 2;

  for (let x = 0; x < tilesPerSide; x += 1) {
    for (let z = 0; z < tilesPerSide; z += 1) {
      const tile = new THREE.Mesh(tileGeometry, tileMaterial.clone());
      const altColor = (x + z) % 2 === 0 ? 0x1f2830 : 0x171d24;
      tile.material.color.setHex(altColor);
      tile.rotation.x = -Math.PI / 2;
      tile.receiveShadow = true;
      tile.position.set(
        x * state.world.tileSize - offset + state.world.tileSize / 2,
        0,
        z * state.world.tileSize - offset + state.world.tileSize / 2
      );
      floor.add(tile);
    }
  }

  return floor;
}

export function createObstacles(state: GameState): THREE.Mesh[] {
  const obstacles: THREE.Mesh[] = [];
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
      const radius = THREE.MathUtils.randFloat(state.world.half * 0.65, state.world.half * 0.95);
      return new THREE.Vector3(Math.cos(angle) * radius, 1, Math.sin(angle) * radius);
    }
    return new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(state.world.half * 1.1),
      1,
      THREE.MathUtils.randFloatSpread(state.world.half * 1.1)
    );
  };

  const isTooClose = (candidate: THREE.Vector3) => {
    const distanceFromCenter = Math.hypot(candidate.x, candidate.z);
    if (distanceFromCenter < minDistanceFromCenter) {
      return true;
    }
    return obstacles.some((existing) => existing.position.distanceTo(candidate) < minDistanceBetweenWalls);
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
    clampToWorld(state, wall.position);
    wall.rotation.y = (i % 2 === 0 ? 0 : Math.PI / 2) + THREE.MathUtils.randFloatSpread(Math.PI / 6);
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.userData = wall.userData || {};
    wall.updateMatrixWorld(true);
    wall.userData.boundingBox = new THREE.Box3().setFromObject(wall);
    obstacles.push(wall);
  }

  return obstacles;
}

export function createLights(state: GameState): THREE.Group {
  const group = new THREE.Group();

  const ambientLight = new THREE.AmbientLight(0x304150, 0.6);
  group.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff1c4, 1.2);
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

  const moonLight = new THREE.DirectionalLight(
    state.currentAtmospherePreset ? state.currentAtmospherePreset.moonColor : 0xaabbee,
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
  const lamps: [THREE.SpotLight, THREE.SpotLight] = [
    new THREE.SpotLight(lampColor, 0.6, 20, Math.PI / 6, 0.4, 1),
    new THREE.SpotLight(lampColor, 0.5, 20, Math.PI / 6, 0.6, 1),
  ];
  const [lampA, lampB] = lamps;

  lampA.position.set(-6, 6, -4);
  lampB.position.set(9, 6, 8);
  lamps.forEach((lamp) => {
    lamp.castShadow = true;
    lamp.target.position.set(lamp.position.x, 0, lamp.position.z);
    group.add(lamp);
    group.add(lamp.target);
    state.lightSources.push({
      id: `static-${state.lightSources.length}`,
      position: new THREE.Vector3(lamp.position.x, 0, lamp.position.z),
      strength: lamp.intensity * 10,
      radius: lamp.distance ? lamp.distance * 0.75 : 15,
      type: "light",
      dynamic: false,
      isWorldLight: true,
    });
    lamp.userData.isWorldLight = true;
  });

  state.ambientLight = ambientLight;
  state.sunLight = sunLight;
  state.moonLight = moonLight;

  return group;
}

export function getObstacleBounds(state: GameState, obstacle: THREE.Object3D | null): THREE.Box3 {
  if (!obstacle) {
    return state.scratch.box.makeEmpty();
  }
  const store = obstacle.userData || (obstacle.userData = {});
  if (!store.boundingBox) {
    obstacle.updateMatrixWorld(true);
    store.boundingBox = new THREE.Box3().setFromObject(obstacle);
  }
  return store.boundingBox;
}

export function isPositionObstructed(
  state: GameState,
  position: THREE.Vector3,
  radius = 0.6
): boolean {
  for (const obstacle of state.obstacles) {
    const bounds = getObstacleBounds(state, obstacle);
    state.scratch.box.copy(bounds).expandByScalar(radius);
    if (state.scratch.box.containsPoint(position)) {
      return true;
    }
  }
  return false;
}

export function findOpenPosition(
  state: GameState,
  preferredPosition: THREE.Vector3,
  radius = 0.6,
  attempts = 24
): THREE.Vector3 {
  state.scratch.vec1.copy(preferredPosition);
  state.scratch.vec1.y = 1;
  clampToWorld(state, state.scratch.vec1);
  if (!isPositionObstructed(state, state.scratch.vec1, radius)) {
    return state.scratch.vec1.clone();
  }

  for (let i = 0; i < attempts; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = radius + 0.6 + Math.random() * 4;
    state.scratch.vec2.set(
      preferredPosition.x + Math.cos(angle) * distance,
      1,
      preferredPosition.z + Math.sin(angle) * distance
    );
    clampToWorld(state, state.scratch.vec2);
    if (!isPositionObstructed(state, state.scratch.vec2, radius)) {
      return state.scratch.vec2.clone();
    }
  }

  state.scratch.vec2.set(0, 1, 0);
  if (!isPositionObstructed(state, state.scratch.vec2, radius)) {
    return state.scratch.vec2.clone();
  }

  return state.scratch.vec1.clone();
}

export function handleObstacleCollisions(
  state: GameState,
  entity: THREE.Object3D,
  previousPosition?: THREE.Vector3
): void {
  const entityBox = new THREE.Box3().setFromObject(entity);
  for (const obstacle of state.obstacles) {
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

export function hasLineOfSight(
  state: GameState,
  fromPosition: THREE.Vector3,
  toPosition: THREE.Vector3
): boolean {
  const origin = state.scratch.vec1.copy(fromPosition);
  origin.y += 0.8;
  const target = state.scratch.vec2.copy(toPosition);
  target.y += 0.8;

  const ray = state.scratch.losRay;
  ray.origin.copy(origin);
  ray.direction.copy(target).sub(origin);
  const distance = ray.direction.length();
  if (distance <= 0.001) {
    return true;
  }
  ray.direction.normalize();

  for (const obstacle of state.obstacles) {
    const bounds = getObstacleBounds(state, obstacle);
    state.scratch.box.copy(bounds).expandByScalar(0.15);
    const hitPoint = ray.intersectBox(state.scratch.box, state.scratch.vec3);
    if (hitPoint && ray.origin.distanceTo(hitPoint) < distance - 0.25) {
      return false;
    }
  }

  return true;
}
