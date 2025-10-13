# Project X - WebGL Isometric MVP

This is a minimal playable prototype inspired by Project Zomboid. It demonstrates an isometric camera, basic survivor controls, and roaming zombies inside a lightweight Three.js scene.

## Features

- Isometric orthographic camera that follows the player.
- WASD movement with sprinting (`Shift`) and simple collision walls.
- Launcher splash with a Developer Sandbox (game mode placeholder for now).
- Sandbox instrumentation for spawning/moving the player, adding or removing zombies, dropping noise pulses or temporary lights, and toggling atmosphere brightness.
- Live zombie debug panels showing state, motivation, target, and distance to the player.
- Zombies roam, investigate footstep noise, and drift toward warm light sources.
- Ambient/directional lighting with fog for atmosphere.
- Basic zombie AI: wander until they sense the player, then chase and apply damage.
- HUD tracking survival time and player health.

## Getting Started

1. Start a local web server inside the project folder (modules require `http://`):
   ```powershell
   # Pick one of the options below
   npx http-server .
   # or
   npx serve .
   ```
2. Open the reported URL (usually `http://localhost:8080` or `http://localhost:3000`).
3. Choose **Developer Sandbox** to access the feature playground. The **Game Mode** option is reserved for future campaign content.

## Controls

- `WASD` - Move the survivor.
- `Shift` - Sprint for a short boost.
- **Developer Sandbox**
  - `Spawn Player` places the survivor on the grid; the `Player Cursor` lets you position them precisely.
  - `Place Zombie` or `Remove Zombie` to seed or clear shamblers (or wipe them all with `Clear Zombies`); `Despawn Player` lets you step out so the AI keeps roaming.
  - `Noise` / `Light` cursors create stimuli to observe AI reactions, while `Toggle Atmosphere` flips between bright lab lighting and moody night mode.
  - `Clear Pulses` removes temporary noise and light markers.

Stay out of melee range of the red shamblers and see how long you can survive.
