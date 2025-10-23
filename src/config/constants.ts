import * as THREE from "three";

import type { AtmospherePreset, AtmosphereState, WorldConfig } from "../types/game.js";

export const NOISE_RIPPLE_SPEED_MULTIPLIER = 8;
export const CLICK_NOISE_VISUAL_RADIUS = 3;
export const FOOTSTEP_NOISE_CELL_SIZE = 1.5;

export const DAY_NIGHT_DURATION_SECONDS = 600;
export const DAY_NIGHT_ACCELERATED_MULTIPLIER = 20;
export const DAY_NIGHT_NORMAL_MULTIPLIER = 1;

export const SUN_ORBIT_RADIUS = 52;
export const SUN_ORBIT_HEIGHT = 38;
export const SUN_ORBIT_DEPTH = -28;

export const MOON_ORBIT_RADIUS = 48;
export const MOON_ORBIT_HEIGHT = 34;
export const MOON_ORBIT_DEPTH = 32;

export const NOISE_RECALL_COOLDOWN_MS = 10_000;
export const NOISE_MEMORY_STALE_MS = 30_000;

export const STATIC_MEMORY_DURATION_MS = 12_000;
export const DYNAMIC_MEMORY_DURATION_MS = 6_000;
export const DYNAMIC_MEMORY_RING_DURATION_MS = 2_400;
export const DYNAMIC_MEMORY_RING_MIN_RADIUS = 0.8;
export const DYNAMIC_MEMORY_RING_MAX_RADIUS = 3.2;

export const PLAYER_FOV_DEGREES = 90;
export const PLAYER_FOV_COS = Math.cos(THREE.MathUtils.degToRad(PLAYER_FOV_DEGREES / 2));

export const CAMERA_FRUSTUM = 16;
export const ISO_ROTATION = THREE.MathUtils.degToRad(45);
export const ISO_TILT = THREE.MathUtils.degToRad(35);

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  size: 22,
  tileSize: 2,
  half: (22 * 2) / 2,
};

export const ATMOSPHERE_PRESETS: Record<AtmosphereState, AtmospherePreset> = {
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
