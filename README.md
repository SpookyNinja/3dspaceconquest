# Space Conquest* (prototype)

Browser 3D roguelite: command a huge Alliance battlecruiser in Vampire-Survivors-style missions fought low over a
planet's surface. Weapons aim and fire on their own; you steer, dodge and collect. Design: [`docs/SPEC.md`](docs/SPEC.md).
Names with `*` are placeholders.

## Play locally

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm test` (simulation, save and reward tests), `npm run build` (static build in `dist/`, works on
GitHub Pages and itch.io because all paths are relative), `npm run preview` (serve the build).

The old standalone asset viewer is still at `/asset-preview.html`.

### Dev URL parameters

| Parameter | Effect |
|---|---|
| `?play=mc_spire` | Skip the menus and start that zone (`mc_spire`, `mc_docks`, `mc_core`, `oc_shallows`, `oc_storm`, `oc_abyss`) |
| `?fast=60` | Mission timer of 60 seconds instead of 8 to 15 minutes |
| `?seed=123` | Fixed random seed (same seed and inputs give the same run) |

In a mission, F3 shows a performance overlay. In the browser console, `__game.spawn('boss')` spawns an enemy next to you.

## Controls

WASD or arrow keys steer (relative to the screen) · hold the left mouse button to fly toward the cursor ·
Space or Shift fires the afterburner · Esc or P pauses · mouse wheel zooms · on touch screens, drag anywhere to steer.

## Code map

| Path | What |
|---|---|
| `src/game/data.ts` | All balance numbers: weapons, enemies, passives, permanent upgrades, factions, planets, zones |
| `src/game/world.ts` | Mission simulation on a 2D plane, fixed 60 Hz, seeded RNG, no Babylon imports (unit-testable) |
| `src/game/save.ts` | Versioned local save (`localStorage`), credits formula, zone Control and front-line rules |
| `src/render/mission.ts` | Mission scene: ships, turrets, thin-instanced projectiles and pickups, effects, camera |
| `src/render/surface.ts` | The planet surface under the battle: night megacity or open ocean |
| `src/render/planetMap.ts` | Planet globe with faction territories and zone markers, dive animation on launch |
| `src/ui.ts`, `src/style.css` | HTML overlay: title, planet map, upgrades, HUD, level-up cards, results |
| `src/audio.ts`, `src/input.ts` | Web Audio mixer with voice limits; keyboard, mouse and touch input |

## Deploy

`.github/workflows/deploy.yml` tests and builds every PR, and deploys `main` to GitHub Pages. Pages has to be switched on
once in the repository settings (Settings → Pages → Source: GitHub Actions).

Asset credits: [`CREDITS.md`](CREDITS.md).
