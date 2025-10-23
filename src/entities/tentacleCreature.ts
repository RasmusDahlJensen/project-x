import * as THREE from "three";

import {
  clampToWorld,
  getObstacleBounds,
  handleObstacleCollisions,
  randomPointNear,
} from "../core/world.js";
import type { GameState, TentacleAnchor, TentacleAppendage, TentacleCreature, TentacleSegment } from "../types/game.js";
import { disposeMeshResources } from "../utils/dispose.js";
import { updateSandboxStatus } from "../ui/devTools.js";

interface SpawnTentacleOptions {
  position?: THREE.Vector3;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const BODY_GEOMETRY = new THREE.SphereGeometry(0.85, 24, 20);
const BODY_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x352447,
  roughness: 0.75,
  metalness: 0.25,
  emissive: new THREE.Color(0x18091f),
  emissiveIntensity: 0.4,
});

const SEGMENT_GEOMETRY = new THREE.CylinderGeometry(0.09, 0.12, 1, 10, 1, true);

const ROOT_OFFSETS = [
  new THREE.Vector3(0.6, 0.2, 0),
  new THREE.Vector3(-0.6, 0.2, 0),
  new THREE.Vector3(0, 0.15, 0.6),
  new THREE.Vector3(0, 0.15, -0.6),
  new THREE.Vector3(0.5, -0.1, 0.5),
  new THREE.Vector3(-0.5, -0.1, -0.5),
];

const tempVec1 = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempVec3 = new THREE.Vector3();
const tempVec4 = new THREE.Vector3();
const tempVec5 = new THREE.Vector3();
const tempVec6 = new THREE.Vector3();
const tempVec7 = new THREE.Vector3();
const tempVec8 = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const tempMat4 = new THREE.Matrix4();

function createTentacleSegments(segmentCount: number): TentacleSegment[] {
  const segments: TentacleSegment[] = [];
  for (let i = 0; i < segmentCount; i += 1) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x5d3cd1,
      roughness: 0.6,
      metalness: 0.35,
      emissive: new THREE.Color(0x281f70),
      emissiveIntensity: 0.25,
    });
    const mesh = new THREE.Mesh(SEGMENT_GEOMETRY, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    segments.push({
      mesh,
      material,
      baseRadius: 0.09,
    });
  }
  return segments;
}

function createTentacleAppendage(rootOffset: THREE.Vector3): TentacleAppendage {
  return {
    rootOffset: rootOffset.clone(),
    segments: createTentacleSegments(4),
    reachLength: 3.5,
    targetPoint: new THREE.Vector3(),
    phase: Math.random() * Math.PI * 2,
    grabbing: false,
  };
}

function orientSegment(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3): void {
  tempVec1.copy(end).sub(start);
  const length = tempVec1.length();
  if (length < 1e-4) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  tempVec1.normalize();
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  tempQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tempVec1);
  mesh.setRotationFromQuaternion(tempQuat);
  mesh.scale.set(1, length, 1);
}

function findWallAnchor(state: GameState, origin: THREE.Vector3): TentacleAnchor {
  let bestDistance = Infinity;
  let bestPoint: THREE.Vector3 | null = null;
  let bestNormal: THREE.Vector3 | null = null;

  state.obstacles.forEach((obstacle) => {
    const bounds = getObstacleBounds(state, obstacle);
    const closest = bounds.clampPoint(origin, tempVec1);
    const toOrigin = tempVec2.copy(origin).sub(closest);
    const distance = toOrigin.length();
    let normal: THREE.Vector3;
    if (distance < 1e-3) {
      // Creature is too close; approximate normal using face with smallest expansion requirement.
      const extents = tempVec3.copy(bounds.max).sub(bounds.min).multiplyScalar(0.5);
      const center = tempVec4.copy(bounds.max).add(bounds.min).multiplyScalar(0.5);
      const local = tempVec2.copy(origin).sub(center);
      // Determine dominant axis normal
      const absX = Math.abs(local.x) - extents.x;
      const absY = Math.abs(local.y) - extents.y;
      const absZ = Math.abs(local.z) - extents.z;
      if (absX >= absY && absX >= absZ) {
        normal = new THREE.Vector3(Math.sign(local.x) || 1, 0, 0);
      } else if (absY >= absX && absY >= absZ) {
        normal = new THREE.Vector3(0, Math.sign(local.y) || 1, 0);
      } else {
        normal = new THREE.Vector3(0, 0, Math.sign(local.z) || 1);
      }
    } else {
      normal = toOrigin.normalize();
    }

    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = closest.clone().add(tempVec1.copy(normal).multiplyScalar(0.75));
      bestNormal = normal.clone();
    }
  });

  if (!bestPoint || !bestNormal) {
    const fallbackPoint: THREE.Vector3 = tempVec1.set(
      THREE.MathUtils.clamp(origin.x, -state.world.half + 1, state.world.half - 1),
      origin.y,
      THREE.MathUtils.clamp(origin.z, -state.world.half + 1, state.world.half - 1)
    );
    const fallbackNormal: THREE.Vector3 = new THREE.Vector3()
      .copy(origin)
      .sub(fallbackPoint)
      .normalize();
    if (fallbackNormal.lengthSq() < 1e-6) {
      fallbackNormal.set(0, 0, 1);
    }
    return {
      point: new THREE.Vector3().copy(fallbackPoint),
      normal: new THREE.Vector3().copy(fallbackNormal),
    };
  }

  return {
    point: new THREE.Vector3().copy(bestPoint!),
    normal: new THREE.Vector3().copy(bestNormal!).normalize(),
  };
}

function ensureWithinBounds(
  state: GameState,
  group: THREE.Group,
  previousPosition?: THREE.Vector3
): void {
  clampToWorld(state, group.position);
  handleObstacleCollisions(state, group, previousPosition);
}

export function spawnTentacleCreature(
  state: GameState,
  options: SpawnTentacleOptions = {}
): TentacleCreature | null {
  if (!state.worldRoot) {
    return null;
  }

  const group = new THREE.Group();
  const bodyMaterial = BODY_MATERIAL.clone();
  const body = new THREE.Mesh(BODY_GEOMETRY, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const tentacles = ROOT_OFFSETS.map((offset) => {
    const appendage = createTentacleAppendage(offset);
    const parent = state.worldRoot ?? state.scene;
    for (const segment of appendage.segments) {
      if (!segment) {
        continue;
      }
      parent.add(segment.mesh);
    }
    return appendage;
  });

  const creature: TentacleCreature = {
    id: ++state.tentacleIdCounter,
    group,
    body,
    tentacles,
    currentAnchor: null,
    wallAttractionTimer: 0,
    state: "lurking",
    moodTimer: 0,
  };

  const spawnPosition =
    options.position ??
    (() => {
      if (state.obstacles.length === 0) {
        return randomPointNear(state, new THREE.Vector3(0, 1, 0), state.world.size * 0.4);
      }
      const obstacleIndex = Math.floor(Math.random() * state.obstacles.length);
      const obstacle = state.obstacles[obstacleIndex];
      if (!obstacle) {
        return randomPointNear(state, new THREE.Vector3(0, 1, 0), state.world.size * 0.45);
      }
      const bounds = getObstacleBounds(state, obstacle);
      const target = bounds.getCenter(new THREE.Vector3());
      target.y = 1;
      const offsetDir = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(1),
        0,
        THREE.MathUtils.randFloatSpread(1)
      ).normalize();
      target.addScaledVector(offsetDir, 3 + Math.random() * 2);
      return target;
    })();

  group.position.copy(spawnPosition);
  group.position.y = 1;
  clampToWorld(state, group.position);

  state.tentacleCreatures.push(creature);
  state.worldRoot.add(group);
  updateSandboxStatus(state);
  return creature;
}

export function removeTentacleCreature(state: GameState, creature: TentacleCreature): boolean {
  const index = state.tentacleCreatures.indexOf(creature);
  if (index === -1) {
    return false;
  }

  creature.tentacles.forEach((tentacle) => {
    tentacle.segments.forEach((segment) => {
      if (!segment) {
        return;
      }
      if (segment.mesh.parent) {
        segment.mesh.parent.remove(segment.mesh);
      }
      disposeMeshResources(segment.mesh, { disposeGeometry: false });
    });
  });

  if (creature.group.parent) {
    creature.group.parent.remove(creature.group);
  }
  disposeMeshResources(creature.group);
  state.tentacleCreatures.splice(index, 1);
  updateSandboxStatus(state);
  return true;
}

export function removeAllTentacleCreatures(state: GameState): number {
  const total = state.tentacleCreatures.length;
  while (state.tentacleCreatures.length > 0) {
    const creature = state.tentacleCreatures[0];
    if (!creature) {
      break;
    }
    removeTentacleCreature(state, creature);
  }
  return total;
}

export function removeNearestTentacleCreature(
  state: GameState,
  point: THREE.Vector3,
  radius = 3
): boolean {
  let best: TentacleCreature | null = null;
  let bestDistance = radius;
  state.tentacleCreatures.forEach((creature) => {
    const distance = creature.group.position.distanceTo(point);
    if (distance < bestDistance) {
      best = creature;
      bestDistance = distance;
    }
  });
  if (best) {
    return removeTentacleCreature(state, best);
  }
  return false;
}

function updateTentacleTargets(
  state: GameState,
  creature: TentacleCreature,
  dt: number,
  hasPlayer: boolean
): void {
  creature.wallAttractionTimer -= dt;
  const bodyPos = creature.group.position;

  if (!creature.currentAnchor || creature.wallAttractionTimer <= 0) {
    creature.currentAnchor = findWallAnchor(state, bodyPos.clone());
    creature.wallAttractionTimer = 3 + Math.random() * 3;
  }

  const anchor = creature.currentAnchor;
  const anchorPoint = (anchor ? anchor.point : bodyPos).clone();
  const anchorNormal = (anchor ? anchor.normal : new THREE.Vector3(0, 0, 1)).clone();
  if (anchorNormal.lengthSq() < 1e-6) {
    anchorNormal.set(0, 0, 1);
  }
  anchorNormal.normalize();

  const desiredPosition = anchorPoint.clone().addScaledVector(anchorNormal, -1.35);
  const moveVec = desiredPosition.clone().sub(bodyPos);
  const distance = moveVec.length();
  const targetHeight = desiredPosition.y;

  if (distance > 0.015) {
    moveVec.normalize();
    const speed = THREE.MathUtils.lerp(0.45, 1.1, Math.min(distance / 5, 1));
    const previousPosition = bodyPos.clone();
    creature.group.position.addScaledVector(moveVec, speed * dt);
    ensureWithinBounds(state, creature.group, previousPosition);
  } else {
    creature.group.position.lerp(desiredPosition, 0.15);
  }

  const lookTarget = anchorPoint.clone();
  lookTarget.y = creature.group.position.y;
  creature.group.lookAt(lookTarget);

  const bob = Math.sin(state.clock.getElapsedTime() * 1.5 + creature.id) * 0.12;
  creature.group.position.y = THREE.MathUtils.lerp(creature.group.position.y, targetHeight + bob, 0.35);
  ensureWithinBounds(state, creature.group);

  const time = state.clock.getElapsedTime();
  const tangent = anchorNormal.clone().cross(WORLD_UP).normalize();
  if (tangent.lengthSq() < 1e-6) {
    tangent.set(1, 0, 0);
  }
  const binormal = anchorNormal.clone().cross(tangent).normalize();

  creature.tentacles.forEach((tentacle, index) => {
    const phase = tentacle.phase;
    const sway = Math.sin(time * 1.8 + phase) * 0.9;
    const vertical = Math.cos(time * 1.2 + phase * 1.3) * 0.5 + 0.35;
    const reach = THREE.MathUtils.lerp(
      tentacle.reachLength * 0.75,
      tentacle.reachLength * 1.05,
      (Math.sin(time * 0.9 + phase) + 1) * 0.5
    );

    const tipTarget = anchorPoint
      .clone()
      .add(tangent.clone().multiplyScalar(sway))
      .add(binormal.clone().multiplyScalar(vertical))
      .add(anchorNormal.clone().multiplyScalar(0.35 * (index % 2 === 0 ? 1 : -1)));

    tentacle.targetPoint.copy(tipTarget);

    state.obstacles.forEach((obstacle) => {
      const bounds = getObstacleBounds(state, obstacle);
      const clamped = tipTarget.clone();
      bounds.clampPoint(clamped, clamped);
      if (clamped.distanceToSquared(anchorPoint) < 9) {
        tentacle.targetPoint.lerp(clamped, 0.35);
      }
    });

    const root = tentacle.rootOffset
      .clone()
      .applyMatrix4(tempMat4.makeRotationFromQuaternion(creature.group.quaternion))
      .add(bodyPos.clone());

    const baseDirection = tentacle.targetPoint.clone().sub(root);
    const cappedLength = Math.min(baseDirection.length(), reach);
    if (cappedLength < 0.01) {
      tentacle.segments.forEach((segment) => {
        if (!segment) {
          return;
        }
        segment.mesh.visible = false;
      });
      return;
    }
    baseDirection.normalize();

    const segmentLength = cappedLength / tentacle.segments.length;
    const curvature = Math.sin(time * 1.6 + phase) * 0.35;
    const lateral = binormal.clone().multiplyScalar(curvature);

    let segmentStart = root.clone();
    tentacle.segments.forEach((segment, segIndex) => {
      if (!segment) {
        return;
      }
      const curveFactor = (segIndex + 1) / tentacle.segments.length;
      const segmentDirection = baseDirection
        .clone()
        .add(tangent.clone().multiplyScalar(curvature * 0.3 * curveFactor))
        .add(lateral.clone().multiplyScalar(curveFactor * 0.5))
        .normalize();

      const segmentEnd = segmentDirection.clone().multiplyScalar(segmentLength).add(segmentStart);
      orientSegment(segment.mesh, segmentStart, segmentEnd);

      segment.material.emissiveIntensity = THREE.MathUtils.lerp(
        segment.material.emissiveIntensity,
        tentacle.grabbing ? 1.2 : 0.25,
        0.12
      );
      segment.material.color.lerpColors(
        new THREE.Color(0x5d3cd1),
        new THREE.Color(tentacle.grabbing ? 0xff6633 : 0x5d3cd1),
        tentacle.grabbing ? 0.7 : 0.25
      );

      segmentStart = segmentEnd;
    });
  });

  if (hasPlayer && state.player && !state.isGameOver) {
    state.player.userData.footstepCooldown = Math.max(state.player.userData.footstepCooldown - dt, 0);
  }
}

export function updateTentacleCreatures(state: GameState, dt: number): void {
  if (state.tentacleCreatures.length === 0) {
    return;
  }

  const hasPlayer = Boolean(state.player);
  const playerPos = state.player ? state.player.position : null;

  state.tentacleCreatures.forEach((creature) => {
    updateTentacleTargets(state, creature, dt, hasPlayer);

    creature.moodTimer += dt;
    const bodyWorld = creature.group.position;
    creature.state = "lurking";

    if (hasPlayer && playerPos && !state.isGameOver) {
      let grabbingAny = false;
      creature.tentacles.forEach((tentacle) => {
        const tip = tentacle.targetPoint;
        const distance = tip.distanceTo(playerPos);
        if (distance < 1.4) {
          const damage = 25 * dt;
          state.player?.userData.onDamage(damage);
          tentacle.grabbing = true;
          grabbingAny = true;
        } else {
          tentacle.grabbing = false;
        }
      });
      creature.state = grabbingAny ? "grabbing" : "reaching";
    } else {
      creature.tentacles.forEach((tentacle) => {
        tentacle.grabbing = false;
      });
    }

    // Occasionally retarget different wall corners to simulate searching.
    if (creature.moodTimer > 6) {
      creature.moodTimer = 0;
      creature.currentAnchor = null;
    }

    // Gentle bobbing motion.
    creature.group.position.y = 1 + Math.sin(state.clock.getElapsedTime() * 1.5 + creature.id) * 0.1;

    ensureWithinBounds(state, creature.group);
  });
}





















