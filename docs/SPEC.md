# Space Conquest* — Game Plan & Design Spec

> Status: **Draft v0.3** (2026-11-04). Names marked with `*` are placeholders.
> Every open choice is tagged **[D#]** and collected in [§10 Decisions for Andre](#10-decisions-for-andre).
> Each one has a recommendation, so we can start building on the defaults and change course later.
>
> **v0.2 decisions by Andre:**
> - The game is **offline / single‑player first**. Accounts, cloud saves and the shared online map are **later** and are kept in mind in the architecture only (§4.5, §6.4–6.6).
> - Factions **push back passively** using a hidden counter‑attack meter (§4.4).
> - **Fewer but tougher enemies** that still feel like an armada (§3.5, §7.2).
> - The game is **free to play**.
>
> **v0.3 decisions by Andre:**
> - **Engine: Babylon.js**, chosen by Claude because Andre won't work in the engine directly (§6.1).
> - **Mission length:** a regular timer that grows with zone difficulty, then optional **endless mode** (§3.1).
> - **Weapons aim themselves.** Many weapon types with their own behaviour and targeting preferences (§3.4.1).

---

## 1. Pitch

A browser‑playable 3D co‑op roguelite. Players join **the Alliance\*** and command huge, slow battleships
in short Vampire‑Survivors‑style missions. Their auto‑firing weapons shred swarms of enemies while the
player steers to dodge and to collect resources. Every mission, won or lost, pays **credits** for permanent
upgrades. Missions are fought over **zones on planets**, and the player pushes the Alliance front line
into enemy faction territory while the factions push back. *Later:* all online players share one galaxy map.

**Pillars**
1. **Feel like a capital ship.** You have weight, momentum and broadsides. You are not a nimble fighter.
2. **One more run.** Runs of 10 to 15 minutes, with a level‑up choice every 30 to 60 seconds and a credit payout every time.
3. **We're winning the war.** Your run visibly moves the front line (shared with other players later).

---

## 2. Core loop

```
 ┌───────────── Meta loop (persistent) ─────────────┐
 │  Hangar: pick ship + loadout, spend credits      │
 │        │                                         │
 │        ▼                                         │
 │  Solar map → Planet → Tactical zone map          │
 │        │  pick an enemy zone bordering Alliance  │
 │        ▼                                         │
 │  ┌──── Mission loop (8–20 min + endless) ─────┐  │
 │  │ fly · auto‑shoot · collect XP + resources  │  │
 │  │ level up → choose 1 of 3 upgrades          │  │
 │  │ survive timer → success → extract/endless  │  │
 │  └────────────────────────────────────────────┘  │
 │        │ result (win/lose, time, kills, loot)    │
 │        ▼                                         │
 │  Credits + zone progress → local save            │
 └──────────────────────────────────────────────────┘
```

---

## 3. Missions (the run)

### 3.1 Structure
- **Two phases (decided v0.3):**
  1. **Regular mission timer.** Survive until the timer runs out and the mission counts as a **success** (this is what adds zone Control, §4.3).
  2. **Endless mode (optional).** When the timer is reached, the player chooses **Extract** (bank rewards) or **Continue**. Enemy scaling
     keeps climbing with no end; it pays bonus credits for every extra minute, and the run ends when the hull reaches 0.
     A death in endless mode still counts as a success and keeps everything earned (the mission was already won).
- **Timer length scales with difficulty.** Harder zones have a longer regular timer, so enemy scaling climbs higher before success.
  Starting numbers to tune:

  | Zone tier | Regular timer | Notes |
  |---|---|---|
  | 1 (border) | 8 min | Learning tier |
  | 2 | 10 min | |
  | 3 | 12 min | |
  | 4 | 15 min | |
  | 5+ (deep) | 18–20 min | Highest scaling before success |

- **Waves:** escalating spawns with mini‑bosses at fixed points (e.g. every ~⅓ of the timer) and a boss at the end of the regular timer.
  Killing the boss is not required for success, but pays a bonus.
- **Lose:** hull reaches 0 before the timer. Still pays credits (less), and adds a little Control if the run got far.

### 3.2 Ships (selection in hangar)
Gameplay happens on a flat 2D plane (XZ) and is rendered in 3D. Every player ship is a **big battlecruiser‑class capital ship**, many times larger than the typical enemy fighter. Starting roster proposal (3 ships for MVP, more later):

| Ship\* | Speed / turn | Hull | Identity |
|---|---|---|---|
| **Bulwark** (Dreadnought) | Very slow / sluggish | Very high | Heavy cannons and armor; the "tank" |
| **Valkyrie** (Battlecruiser) | Medium / medium | Medium | Lasers and missiles; the all‑rounder |
| **Hive** (Carrier) | Slow / slow | High | Launches drone wings that auto‑hunt; summoner |

**Weapons aim themselves (decided v0.3).** The player never aims. Steering is only for dodging, positioning and collecting
resources. Each weapon system has its own firing behaviour and its own **targeting preference** (§3.4.1). Weapons are shown as
turrets/launchers on the ship model, so the tilted camera shows them turning and firing.

### 3.3 Movement
- Ships have **mass**: acceleration, max speed, turn rate and drift.
- **WASD**: thrust in that direction relative to the screen; the ship rotates toward the movement vector at its turn rate.
- **Mouse**: hold left click to fly toward the cursor (or click to set a waypoint).
- **Gamepad**: left stick. **Touch**: floating virtual joystick (see §7.4).
- An optional active ability on Space or Shift per ship (e.g. Bulwark "Brace shields", Valkyrie "Afterburn", Hive "Recall drones").

### 3.4 In‑run progression
| Source | What it gives |
|---|---|
| **XP shards** (dropped by kills) | Fills the XP bar → **Level up: choose 1 of 3** (new weapon, weapon upgrade, passive buff) |
| **Ore** (asteroids/wrecks you must fly to) | Hull repair + armor stacks |
| **Energy** (nebula pockets, drifting) | Charges the active ability / overdrive |
| **Salvage** (rare, from elites) | Bonus credits at run end + 1 reroll/banish token |

These resource roles are a proposal **[D3]**. The point is that resources pull the player *away from safety*,
which creates the "maneuver to gather" tension you described.

#### 3.4.1 Weapon systems
Every weapon fires automatically. Weapons differ in **how** they deal damage and **what** they target.

| Weapon\* | Behaviour | Targeting preference |
|---|---|---|
| **Pulse laser** | Fast travelling bolts | Nearest enemy |
| **Arc zapper** | Electric bolt that chains between nearby enemies | Densest cluster |
| **Rail battery** | Slow, piercing shot that goes through a line of enemies | Heaviest enemy (most HP) |
| **Missile pod** | Homing missiles in salvos | Spread across different targets |
| **Flak cannon** | Shells that burst into an area | Densest cluster |
| **Beam lance** | Continuous beam that sweeps | Strongest enemy in range |
| **Point defense** | Very short‑range rapid fire, also shoots down enemy missiles | Closest threat / projectiles |
| **Drone bay** | Launches drones that hunt on their own | Drones pick targets |
| **Mine layer** | Drops mines behind the ship | None (placed on the ship's path) |
| **Shockwave emitter** | Periodic ring that pushes back and damages | All around the ship |

Targeting modes as an engine feature: `nearest`, `cluster`, `heaviest`, `lowest_hp`, `spread`, `random`, `projectiles`.
Upgrades can change a weapon's mode (for example "Rail battery: Hunter‑killer, now targets elites first").

- **MVP pool:** about 8 of the above; the rest come later.
- **Evolutions:** a max‑level weapon plus a specific passive evolves into a super‑weapon (proven Vampire Survivors hook).
- **Passives:** hull, armor, fire rate, projectile speed, magnet range, cooldown, crit, engine power.

### 3.5 Enemies
- Each **faction** has its own look, enemy roster and behaviour (e.g. *Swarm\**: many weak bio‑ships; *Iron Concord\**: armored
  drones with shields; *Void Cult\**: teleporters and beams).
- Archetypes: chaser, shooter, tank, splitter, kamikaze, elite (drops salvage), mini‑boss, boss.
- **Difficulty knobs** per zone tier: spawn rate, enemy HP/damage multipliers, elite chance, boss modifiers.

**Fewer, tougher enemies that still feel like an armada (v0.2).** Rather than Vampire Survivors' thousands of
tiny enemies, the target is roughly **60–150 active enemies** on screen, weighted toward bigger, tougher types. The "armada" feeling comes from:
- **Formations and squadrons:** enemies arrive as wings in V‑shapes and lines, not as random dots, so 12 ships read as one fleet.
- **Scale contrast (Andre, v0.3):** the player's battlecruiser is **huge**; enemies are **mostly small ships and fighters** swarming around it.
  Size tiers: fighters (most common, die fast) → gunships/bombers → frigates (uncommon) → rare elite cruisers and bosses, which are the only enemies close to the player's size.
- **Carriers that launch fighters** keep the screen busy cheaply.
- **Background fleet:** non‑interactive enemy and Alliance capital ships fighting far below and around the play area (cheap, low detail, never collide).
- **Warp‑in effects and big wave announcements** ("Enemy battle group inbound").
- **Bullet‑hell‑lite:** enemy projectiles and missiles add density without adding enemy count.

### 3.6 Meta progression (credits)
- Credits = f(time survived, kills, win bonus, salvage, zone tier multiplier).
- **Spend on:** permanent stat upgrades (small, many tiers), new ships, extra hardpoint slots, starting weapon choice,
  rerolls/banishes per run, cosmetics (paint, trails).
- **Losing still pays**, which matters for retention.

---

## 4. Galaxy, planets and zone conquest

### 4.1 Hierarchy
**Solar map** (one system to start, about 5 planets) → **Planet** → **Tactical map**: the planet surface is split into
**zones** (hex grid or Voronoi regions, about 20 to 40 per planet), each owned by the Alliance or a faction.

Each planet has a **biome** that sets the mission backdrop (jungle, city under siege, ocean, desert, ice) and a
dominant enemy faction.

### 4.2 Which zones are playable
- A zone is **attackable** if it is enemy‑owned and adjacent to an Alliance zone (the front line).
- **Depth** = distance in zones from the original Alliance foothold, or from the nearest Alliance‑held border. Deeper means a
  higher **difficulty tier** and better credit multiplier. This matches your "the further we push, the harder it gets".

### 4.3 Capture rule (offline version) [D4]
Each zone has **Control** from 0 to 100% for the Alliance.
- A successful run (regular timer reached) adds Control (proposal: +35%, +10% bonus for killing the boss). A loss adds a little Control
  depending on how far into the timer it got (e.g. up to +10%). So a zone takes about 3 successful runs.
- The zone flips when Control hits 100%. Neighbouring zones become attackable.
- Control is the "how far the player has pushed into the zone" value that drives push‑back (§4.4).
- *Later, online:* Control is shared by all players, with a per‑player daily cap and a threshold that scales with how many people are active, so the map neither stalls with few players nor finishes in an hour with many.

### 4.4 The enemy pushes back (passive counter‑attack meter)
If factions never retake ground, the map gets "finished" and stops mattering. Andre's model (v0.2):

- Each enemy faction has a **hidden Counter‑attack meter** (0 → 100) per planet.
- The meter **fills passively in real time**, including while the game is closed. On load, the game computes elapsed time from the last
  saved timestamp and applies the gain (capped at, say, 72 hours so a long break doesn't wipe the map).
- **Fill rate depends on how far the player has pushed** into that faction's territory. Example numbers, to tune later:

  | Player pressure on the faction | Meter gain |
  |---|---|
  | Only border zones attacked | 1 point / hour |
  | Player is 2–3 zones deep, or a zone is partially captured | 2–3 points / hour |
  | Player is deep in faction territory | 5 points / hour |

  Proposed formula: `rate = base + k × (sum of Control % in partly‑captured zones + zones captured from that faction)`, clamped to a maximum.
- **At 100** the faction counter‑attacks: it retakes Control on the Alliance's most recently captured border zone (or reduces partial
  Control in contested zones), and the meter resets to 0.
- **Optional, later:** a warning when the meter passes ~80 ("Swarm fleet massing near Sector 4"), and a **Defense mission** that lowers the meter.
  This lets the player react instead of just watching the bar.
- **Seasons [D5]** (resets/rotating systems) only matter once the map is online, so they're deferred.

### 4.5 Shared online state (later)
Not in the first version. The design keeps it possible:
- All zone and progression logic lives behind one `GameStateStore` interface. Offline it reads and writes the local save; later
  a Supabase implementation (§6.4) can replace it without touching gameplay.
- Online, the map is **eventually consistent**: clients fetch zone state when the map opens and subscribe to live updates, and the push‑back meter runs on the server.
- Runs stay **single‑player**; real‑time co‑op in the same mission is a much bigger project and remains a stretch goal **[D6]**.

---

## 5. Camera, presentation and controls

### 5.1 Camera
- Top‑down with **~55–65° pitch** and a slight yaw offset, so you see the deck and one flank of the battleship.
- Follows the ship with soft damping and a small look‑ahead in the direction of travel; zooms out slightly as the ship grows
  or when the screen gets crowded.
- Screen shake on big hits (with a toggle in settings).

### 5.2 The planet below
- Layered backdrop under the play plane: **planet surface** (large tiled/streamed ground mesh or textured plane per biome)
  → **cloud layer** (scrolling, semi‑transparent) → play plane with ships.
- Scrolls slowly with parallax as the ship moves, which sells altitude and scale.
- Biome set dressing: city (burning buildings, flak tracers), jungle (canopy, mist), ocean (animated water, naval wrecks).
- This is purely visual; it never collides, so it can be cheap (low‑poly, baked lighting).

### 5.3 UI screens
Title/login → Hangar (ship, loadout, upgrades) → Solar map → Tactical map → Mission (HUD: hull, XP bar, timer, resources,
minimap edge indicators) → Level‑up modal (pause) → Results (credits, contribution, zone progress) → back to Hangar.

---

## 6. Technology

### 6.1 Engine comparison [D7]

Constraints: hosted as **static files** on GitHub Pages and/or itch.io, 3D, **hundreds of enemies on screen**, quick to load in a
browser, works on mobile later, talks to a backend for accounts and shared map.

| | **Babylon.js** (TS) | **Three.js** (TS) | **Godot 4** web export | **Unity 6** WebGL |
|---|---|---|---|---|
| Type | Full web game engine (code‑first) | Rendering library + DIY | Full engine + editor | Full engine + editor |
| Download size (empty) | ~1–3 MB | ~0.6–1 MB | ~8–10 MB compressed (wasm) | ~5–15 MB+, grows quickly |
| Load time / mobile web | Excellent | Excellent | OK; mobile web is weaker | Weakest; mobile web officially limited |
| Built‑ins | Physics, particles, GUI, audio, inspector, instancing, glTF | Rendering only; add libs for the rest | Everything, great 2D/3D editor | Everything, biggest asset store |
| Many enemies | Thin instances, solid particle system | InstancedMesh, BatchedMesh | MultiMesh; fine | GPU instancing / ECS; fine |
| GitHub Pages | Works out of the box | Works out of the box | Needs single‑threaded export (Godot 4.3+) because Pages can't set COOP/COEP headers | Works; large builds, compression config fiddly |
| Backend (Supabase/Firebase) | Official JS SDKs, trivial | Official JS SDKs, trivial | Via HTTP/community plugin | Via REST / community SDKs |
| Language | TypeScript | TypeScript | GDScript (C# **not** supported on web export) | C# |
| Visual editor | No (Inspector + Playground only) | No | **Yes** | **Yes** |
| Cost/licence | Free, Apache‑2.0 | Free, MIT | Free, MIT | Free tier, Unity terms apply |

**Decision (v0.3): Babylon.js + TypeScript + Vite.** Andre doesn't want to work in the engine himself, so the choice is the one Claude can build, test and maintain best entirely in code.
- It is web‑native, so it has the smallest download, fastest load and best mobile‑browser story, and it deploys to Pages and itch with zero tricks.
- It is a real game engine (not just a renderer), with the things this game needs built in.
- The backend SDKs are first‑class JavaScript, which matters because accounts and the shared map are core features.
- Everything is code and data in the repo, so it's easy to review, diff, test and build together (including with Claude).

**Does the engine decide the look?** Mostly no. In a web game the look comes from the 3D models, textures, lighting,
post‑processing (bloom, glow, colour grading) and effects. Babylon.js supports physically based materials, bloom, glow layers,
GPU particles and shadows, which covers both a stylized low‑poly look and a more realistic sci‑fi look. The art style (D13)
matters far more than the engine.

**Pick Godot 4 instead if** you personally want to lay out scenes, UI and levels in a visual editor and you're happy with GDScript
and a heavier web build. **Three.js** is a fine alternative to Babylon if you prefer a lighter library and don't mind assembling
audio, UI, particles and so on yourself. **Unity WebGL is not recommended** for this project, because build size and mobile web support work against a browser‑first game.

### 6.2 Proposed stack (if Babylon.js)
- **Language/build:** TypeScript, Vite, ESLint/Prettier, Vitest for logic tests.
- **Rendering:** Babylon.js; glTF/GLB assets compressed with meshopt/Draco; KTX2 textures.
- **Gameplay simulation:** custom lightweight ECS‑style loop on the 2D plane; **no physics engine** for combat
  (circle collisions + spatial hash grid). Fixed timestep (e.g. 30 or 60 Hz) and a **seeded RNG** (helps anti‑cheat and bug repro).
- **UI:** HTML/CSS overlay (Preact or Svelte) for menus and maps; Babylon GUI only for in‑world elements.
- **Audio:** Babylon audio engine (or Howler.js).
- **Data‑driven content:** ships, weapons, enemies, waves and zones in JSON/TS data files so balance changes need no code.
- **CI/CD:** GitHub Actions → build → deploy to GitHub Pages on every merge to `main`; `butler` push to itch.io on tagged releases.

### 6.3 Hosting
- **GitHub Pages:** free, static, custom domain possible, no custom headers (fine for Babylon/Three). Good for dev/preview builds.
- **itch.io:** HTML5 upload (zip), great discoverability, comments/devlogs, optional payments/donations. Embed in an iframe; enable
  fullscreen button. Good for the public release.
- **Both [D8]:** Pages for nightly/dev, itch.io for public releases. Both read from the same backend.

### 6.4 Backend [D9] (later, not in the first version)
Static hosts can't store accounts or shared state, so the online phase needs a hosted backend. Both options below have usable free tiers.
Until then everything is saved locally in the browser.

| | **Supabase** | **Firebase** |
|---|---|---|
| Database | Postgres (SQL, relational: ideal for zones, adjacency, runs) | Firestore (NoSQL documents) |
| Auth | Email magic link, OAuth (Google, Discord, GitHub…), anonymous | Email, OAuth, anonymous |
| Server logic | Edge Functions (Deno/TS) + Postgres functions + `pg_cron` | Cloud Functions (**needs paid Blaze plan**) |
| Realtime | Postgres changes / broadcast channels | Firestore listeners |
| Security | Row Level Security policies | Security Rules |
| EU hosting (GDPR) | Choose EU region (e.g. Frankfurt) | Choose EU region |
| Lock‑in | Low (it's Postgres; can self‑host) | High |
| Free‑tier gotcha | Free projects **pause after ~1 week of inactivity**; ~$25/mo Pro tier once live | Server functions require billing account |

**Recommendation: Supabase.** The zone map is relational (planets → zones → adjacency → runs), server logic is free and in
TypeScript, realtime is built in, and you can host in the EU.

### 6.5 Data model sketch (Supabase, later)
```
profiles(id ↔ auth.users, display_name, created_at, credits, season_xp)
ship_unlocks(user_id, ship_id)
meta_upgrades(user_id, upgrade_id, level)
planets(id, name, biome, faction_default, season_id)
zones(id, planet_id, owner_faction, control_pct, depth, tier, polygon/hex_coords)
zone_adjacency(zone_id, neighbor_id)
runs(id, user_id, zone_id, seed, started_at, ended_at, client_version,
     result, duration_s, kills, xp, milestone_reached, credits_awarded,
     contribution, validated, flags)
zone_contributions(zone_id, user_id, day, points)   -- enforces per‑player caps
seasons(id, starts_at, ends_at, state)
```
**Flow:** `start_run` (edge function) checks the zone is attackable and returns `run_id + seed + server start time` →
the client plays → `finish_run` validates (see §7.1), awards credits, and adds capped contribution → a Postgres trigger updates
`zones.control_pct` and flips ownership → clients get the change over realtime. Clients **never** write credits or zone state directly (RLS denies it).

### 6.6 Save data
- **Now (offline):** everything (credits, unlocks, upgrades, zone Control, push‑back meters, last‑played timestamp, settings) is saved in
  the browser's IndexedDB/`localStorage`.
- **Export/import save** as a file in settings. Browser storage can be wiped when the player clears site data, and itch.io and
  GitHub Pages are different websites with separate storage, so this is the player's backup until cloud saves exist.
- **Versioned save schema** with migrations from day one.
- **Later (online):** meta progression moves server‑side. Players keep playing as guests and link an account later, and the
  existing local save is uploaded on first login **[D10]**.

---

## 7. Things you didn't list but will need

### 7.1 Anti‑cheat (only matters once the map is online)
While the game is offline and single‑player, cheating only affects the cheater, so no anti‑cheat is needed. For later:
Any browser game can be modified, so assume the client can lie. The goal is to make cheating **pointless for the shared map**, not impossible.
1. **Server‑authoritative economy:** credits and zone control are computed server‑side from submitted results; the client never sets them.
2. **Plausibility checks in `finish_run`:** wall‑clock duration vs. claimed duration (server timestamp from `start_run`), max
   kills/XP per minute for the tier, valid ship/loadout for that account, one active run per account, client version check.
3. **Caps:** per‑player contribution cap per zone per day (§4.3) and run submission rate limits.
4. **Flagging, not instant bans:** suspicious runs are stored with `flags`, give no contribution, and get reviewed.
5. **Later, if needed:** deterministic sim plus input recording, so the server can replay suspicious runs from seed + inputs.
Because the game is co‑op (no PvP, no leaderboard money), the stakes are low; points 1 to 3 are enough for launch.

### 7.2 Performance with many enemies
- Budget (v0.2): **60 fps on a mid laptop with ~150 active enemies, several capital ships, ~800 projectiles and the 3D planet backdrop**, and 30 fps on mid phones with reduced caps.
  Fewer enemies leaves room for better‑looking models, effects and the planet, which is where the GPU budget goes now.
- GPU **instancing** for enemies, projectiles and pickups (one draw call per type); **object pooling** (no allocations in the loop).
- Simulation on 2D circles with a **spatial hash**; no physics engine for combat.
- XP shard **merging** when too many lie on the floor (Vampire Survivors does this too).
- Low‑poly models (enemies ≤ 1–2k triangles, player ship ≤ 20–50k), LODs, compressed textures, a baked/simple lighting setup.
- **Quality presets** (shadows, particles, resolution scale) plus auto‑detect.
- A performance overlay (fps, entity count, draw calls) from day one.

### 7.3 Audio
- Music: per biome/faction tracks plus a boss track; dynamic intensity layers are a nice extra.
- SFX: weapons (vary pitch, limit concurrent voices, or 200 flak guns will deafen you), explosions, level‑up, pickup, UI.
- Settings: master/music/SFX volume and mute. Browsers block audio until the first click, so start audio from the title screen button.

### 7.4 Mobile [D11]
- Recommendation: **desktop/browser first**, but design for touch from the start: big UI targets, a virtual joystick, no hover‑only UI,
  landscape lock, and lower quality preset. Auto‑fire games suit mobile very well.
- Later: wrap the web build as an app (Capacitor) if you want store presence.

### 7.5 Analytics and balancing
- *Later (needs a backend and a privacy note):* log anonymous run telemetry: ship, zone tier, death time, cause of death, upgrades picked/skipped, credits earned.
  This is **the** tool for balancing a survivors‑like.
- Product analytics: prefer **cookie‑less, privacy‑friendly** options (own Supabase table, Plausible, or self‑hosted Umami) so no cookie banner is needed.
- Error reporting (e.g. Sentry free tier) for browser crashes.

### 7.6 Legal and privacy (you're in Germany/EU)
**What the terms mean** (plain explanation, not legal advice):
- **GDPR** (German: DSGVO) is the EU's data‑protection law. It applies when you collect personal data such as emails, account IDs,
  IP addresses or tracking data. It requires a privacy policy and lets players ask for their data to be deleted.
- **Impressum** is a German "legal notice" page with the name and contact address of whoever is responsible for a website. German law
  requires it for online services offered in a business‑like way. Whether a free hobby game needs one is a grey area.

**What that means for us right now:** the offline, free version stores everything in the player's own browser and collects nothing,
so there is almost nothing to do. itch.io and GitHub run their own hosting and have their own privacy policies.
- Don't add analytics or error reporting that send data until we've written a short privacy note.
- Avoid loading fonts or scripts from third‑party servers at runtime (bundle them instead). German courts have treated
  loading Google Fonts from Google's servers as sending the visitor's IP address without consent.
- If you publish under your real name or use a custom domain, consider a simple Impressum page; it costs nothing to add.

**When the online version arrives**, this list applies:
- **Privacy policy** (what you store: email/OAuth ID, display name, progress, telemetry; where: EU region; how long; how to delete).
- **Account deletion and data export** in the settings screen.
- **Impressum:** German law can require one for publicly offered online services, depending on how commercial the offering is. Check this before a public launch.
- **Data processing agreements (DPA)** with backend/analytics providers (Supabase offers one).
- **Age:** in Germany the GDPR consent age is 16; keep data minimal and avoid collecting birthdates if possible.
- **Display names:** profanity filter and a report option, since names are visible on a shared map or contributor lists.
- **Asset licences:** keep `CREDITS.md` and an asset ledger (see §8).
- **Name/trademark check** before the final name: "Space Conquest" and "Alliance" are generic, and similarly named games probably exist.
  This is one reason to keep the placeholder names until later.

### 7.7 Other
- **Monetization [D12]: decided, free to play.** Still prefer CC0/CC‑BY assets over "NonCommercial" ones: an optional itch.io
  donation or tip counts as commercial for some licences, and it keeps the option open.
- **Localization:** English + German from the start is cheap if all strings live in one file.
- **Accessibility:** colour‑blind‑safe faction colours, screen‑shake/flash toggles, remappable keys, readable font sizes.
- **Art direction:** mixing free packs from different artists looks inconsistent. Choose **one style** early (recommendation: stylized low‑poly,
  which is cheap to render, matches the best free packs, and ages well).
- **Repo hygiene:** keep large source assets (.blend, .psd) out of git or use Git LFS; commit only optimized GLB/KTX2.
- **Community and live ops:** a Discord server, devlogs on itch, an in‑game news panel (fed from the backend) for "the Alliance pushed into sector 7!"

---

## 8. 3D assets: where to get them

Always check the licence of **each individual asset**. Record source, author, licence and URL in `assets/ASSETS.md`.

**Licence cheat sheet**
- **CC0 / public domain:** use freely, no credit required (crediting is still nice).
- **CC‑BY:** free, but you **must** credit the author.
- **CC‑BY‑SA:** credit, plus your changes to that asset must use the same licence. Usually fine for assets, but be careful.
- **CC‑NC (NonCommercial):** **avoid** if you might ever monetize, including donations.
- **"Standard/royalty‑free" store licences:** usually fine in games, but some forbid redistribution in a way a web build might expose (files are downloadable). Read the terms.

**Free sources**
| Source | What | Licence |
|---|---|---|
| **Kenney.nl** | Space kits, UI, SFX, cohesive low‑poly style | CC0 |
| **Quaternius** | Spaceships, sci‑fi props, animated creatures | CC0 |
| **Poly Pizza** | Searchable low‑poly models (Kenney/Quaternius and others) | Per asset (CC0 / CC‑BY) |
| **Sketchfab** | Huge library, filter by "Downloadable" + licence | Per asset (often CC‑BY) |
| **OpenGameArt** | Models, textures, music, SFX | Mixed; check each |
| **Poly Haven** | HDRIs (space/skies), PBR textures, some models | CC0 |
| **ambientCG** | PBR textures (ground, metal, foliage for biomes) | CC0 |
| **NASA / Solar System Scope** | Planet textures for the solar map | NASA mostly public domain; Solar System Scope CC‑BY 4.0 |
| **Freesound** | SFX | Mixed (CC0/CC‑BY/NC; filter it) |
| **Sonniss GDC bundles** | Large pro SFX packs | Royalty‑free, commercial OK |
| **jsfxr / ChipTone** | Generate your own retro SFX | You own the output |

**Paid (later)**
- **Synty Studios** (POLYGON Sci‑Fi Space and others): large, consistent low‑poly packs. Buy from Synty directly and check the licence for non‑Unity engines and web builds.
- **itch.io asset packs, CGTrader, Fab (Epic)**: good individual ships; check licences.
- **Commissions** for the hero battleships: the player ships are the main identity, so they're the best place to spend money first.
- **AI 3D generators** (Meshy, Tripo, etc.) can work for props and placeholders. Check their commercial terms and expect manual cleanup.

**Workflow:** Blender (free) to adjust/scale/re‑export → `gltf-transform` to compress (meshopt + KTX2) → GLB in repo.

---

## 9. MVP scope and milestones

Guiding rule: **prove the run is fun offline before building anything online.**

| Milestone | Goal | Contents | "Done" when |
|---|---|---|---|
| **M0: Greybox prototype** | Is it fun? | Project setup + CI deploy to Pages; 1 ship (boxes OK); WASD/mouse movement with inertia; tilted camera; 3 enemy types; 3 weapons; XP + level‑up choice; 10 min timer; one static planet backdrop | Andre plays 5 runs and wants a 6th |
| **M1: Vertical slice** | One great‑looking mission | Real assets in one art style; 2–3 ships; ~8 weapons + 2 evolutions; resources (ore/energy/salvage); mini‑boss + boss; credits + meta upgrade screen; local save; audio; perf budget met | Shareable with friends as a link |
| **M2: Conquest map (offline)** | Conquest structure | Solar map (1 system), 2 planets/biomes, tactical zone map with adjacency, depth → difficulty tiers; zone Control saved locally; passive faction push‑back meter (§4.4); save export/import | Capturing zones changes the next missions, and factions take ground back while you're away |
| **M3: Public release (offline)** | Release on itch.io | 3 factions, 3 biomes, 3 ships; settings/accessibility; touch controls; itch page; GitHub Pages build | Public itch.io release |
| **M4: Online (later)** | Shared war | Supabase project (EU); guest + account login; cloud save; run validation; shared zones; realtime map; server‑side push‑back; privacy policy and account deletion | Two people on different PCs move the same zone |
| **M5: Live (later)** | Retention | Seasons, events, more systems/planets, cosmetics, news panel | Ongoing |

M0 and M1 are the bulk of the *game* work. M4 is the bulk of the *online* work and is deliberately last.

---

## 10. Decisions for Andre

You can answer these one by one; the recommendation is what we'll assume until you say otherwise.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Mission length | Fixed / scales with difficulty | ✅ **Decided:** regular timer 8–20 min by tier, then optional endless mode (§3.1) |
| **D2** | Weapon aiming | Arcs / full auto‑aim | ✅ **Decided:** full auto‑aim, each weapon has its own behaviour and targeting preference (§3.4.1) |
| **D3** | Role of resources | As in §3.4 / resources also feed level‑ups / other | **§3.4 proposal** |
| **D4** | Zone capture rule | Control % per zone (offline, §4.3) | ✅ **Decided:** Control %, passive push‑back meter (§4.4); exact numbers tuned in M2 |
| **D5** | Seasons | Persistent map / resets / rotate solar systems | ⏸ **Later** (online only) |
| **D6** | Real‑time co‑op in missions | No / later stretch goal | ⏸ **Later** |
| **D7** | Engine | Babylon.js / Three.js / Godot 4 / Unity | ✅ **Decided: Babylon.js + TypeScript** (Claude builds it in code) |
| **D8** | Hosting | GitHub Pages / itch.io / both | **Both** (Pages = dev, itch = public) |
| **D9** | Backend | Supabase / Firebase / other | ⏸ **Later**; Supabase (EU) is the current favourite |
| **D10** | Login | Guest first, link account later | ⏸ **Later**; no accounts in the first version |
| **D11** | Platforms | Desktop only / desktop first, touch‑ready / mobile first | **Desktop first, touch‑ready** |
| **D12** | Monetization | Free / donations / cosmetics / paid | ✅ **Decided: free to play** |
| **D15** | Enemy density | Thousands of small / ~60–150 tougher in formations | ✅ **Decided: fewer, tougher, armada feel** (§3.5) |
| **D13** | Art style | Stylized low‑poly / realistic PBR / other | **Stylized low‑poly** |
| **D14** | Final names | Keep placeholders until public release (M3) | **Keep placeholders**, trademark check before naming |

**Next step after decisions:** start **M0** (repo scaffold, CI deploy to GitHub Pages, greybox ship, movement and camera).
