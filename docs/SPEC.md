# Space Conquest* — Game Plan & Design Spec

> Status: **Draft v0.1** (2026-11-04). Names marked with `*` are placeholders.
> Every open choice is tagged **[D#]** and collected in [§10 Decisions for Andre](#10-decisions-for-andre).
> Each one has a recommendation, so we can start building on the defaults and change course later.

---

## 1. Pitch

A browser‑playable 3D co‑op roguelite. Players join **the Alliance\*** and command huge, slow battleships
in short Vampire‑Survivors‑style missions. Their auto‑firing weapons shred swarms of enemies while the
player steers to dodge and to collect resources. Every mission, won or lost, pays **credits** for permanent
upgrades. Missions are fought over **zones on planets**, and all online players share one galaxy map:
together they push the Alliance front line into enemy faction territory.

**Pillars**
1. **Feel like a capital ship.** You have weight, momentum and broadsides. You are not a nimble fighter.
2. **One more run.** Runs of 10 to 15 minutes, with a level‑up choice every 30 to 60 seconds and a credit payout every time.
3. **We're winning the war together.** Your run visibly moves a shared front line.

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
 │  ┌──── Mission loop (one run, ~10–15 min) ────┐  │
 │  │ fly · auto‑shoot · collect XP + resources  │  │
 │  │ level up → choose 1 of 3 upgrades          │  │
 │  │ survive waves → boss / extraction          │  │
 │  └────────────────────────────────────────────┘  │
 │        │ result (win/lose, time, kills, loot)    │
 │        ▼                                         │
 │  Credits + zone contribution → server            │
 └──────────────────────────────────────────────────┘
```

---

## 3. Missions (the run)

### 3.1 Structure
- **Length:** a 12 minute target is the proposal **[D1]**. Vampire Survivors uses 30, but shorter suits
  browser and mobile sessions and gives the zone map more frequent updates.
- **Phases:** Approach (0:00–0:30, ship flies in, cinematic) → Waves (escalating, mini‑boss at 4:00 and 8:00)
  → Boss or Extraction at 12:00.
- **Win:** kill the boss, or survive until extraction. **Lose:** hull reaches 0. Both pay credits; a win pays more.
- **"Progressed far enough"** for zone capture means reaching a **milestone** (for example 8:00 survived or boss killed).
  See §4.3.

### 3.2 Ships (selection in hangar)
Gameplay happens on a flat 2D plane (XZ) and is rendered in 3D. Starting roster proposal (3 ships for MVP, more later):

| Ship\* | Speed / turn | Hull | Identity |
|---|---|---|---|
| **Bulwark** (Dreadnought) | Very slow / sluggish | Very high | Heavy broadside batteries; the "tank" |
| **Valkyrie** (Battlecruiser) | Medium / medium | Medium | Forward‑arc guns and missiles; the all‑rounder |
| **Hive** (Carrier) | Slow / slow | High | Launches drone wings that auto‑hunt; summoner |

**Signature twist: weapon arcs.** Each ship has **hardpoints** (front, port, starboard, rear, turret). Weapons
fire automatically, but only inside their arc, so *steering is aiming*. Showing one side of the ship through
the tilted camera supports this directly. Turrets fire 360°. **[D2]**: arcs, or fully 360° auto‑aim like Vampire Survivors.

### 3.3 Movement
- Ships have **mass**: acceleration, max speed, turn rate and drift.
- **WASD**: thrust in that direction relative to the screen; the ship rotates toward the movement vector at its turn rate.
- **Mouse**: hold left click to fly toward the cursor (or click to set a waypoint).
- **Gamepad**: left stick. **Touch**: floating virtual joystick (see §8.4).
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

- **Weapon pool (MVP ~8):** Flak cannon, Rail battery, Missile pod, Laser lance, Point‑defense, Mine layer, Drone bay, Ion arc.
- **Evolutions:** a max‑level weapon plus a specific passive evolves into a super‑weapon (proven Vampire Survivors hook).
- **Passives:** hull, armor, fire rate, projectile speed, magnet range, cooldown, crit, engine power.

### 3.5 Enemies
- Each **faction** has its own look, enemy roster and behaviour (e.g. *Swarm\**: many weak bio‑ships; *Iron Concord\**: armored
  drones with shields; *Void Cult\**: teleporters and beams).
- Archetypes: chaser, shooter, tank, splitter, kamikaze, elite (drops salvage), mini‑boss, boss.
- **Difficulty knobs** per zone tier: spawn rate, enemy HP/damage multipliers, elite chance, boss modifiers.

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

### 4.3 Capture rule (proposal) [D4]
Each zone has **Control** from 0 to 100% for the Alliance.
- A run in a zone that reaches the milestone adds **contribution points** (more for a win, more for deeper tiers).
- The zone flips when Control hits 100%. Neighbouring zones become attackable.
- **Per‑player cap per zone per day**, so one player (or one cheater) can't capture alone. This keeps it genuinely co‑op.
- **Threshold scales with active players.** This is important: with 5 players online a fixed "100 players needed"
  stalls forever, and with 5,000 the map is done in an hour. Threshold ≈ `base × clamp(active_players_24h / target, min, max)`.

### 4.4 The enemy pushes back (you'll need this)
If factions never retake ground, the map gets "finished" and stops mattering. Proposal:
- A server job runs every N hours: factions regain Control in zones that nobody attacked recently, and can **counter‑attack**
  Alliance zones along the border (players defend with "Defense" missions in Alliance zones).
- **Seasons [D5]**: every 4 to 8 weeks the war resolves (rewards for all participants) and the map resets or rotates to a new solar system.

### 4.5 Shared online state
- The map is **eventually consistent**: clients fetch zone state when the map opens and subscribe to live updates (Control % ticking
  up while you browse is a great "living world" feeling).
- Runs themselves are **single‑player** in MVP; only results are shared. Real‑time co‑op in the same mission is a much bigger
  project (netcode, servers) and is listed as a stretch goal **[D6]**.

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

**Recommendation: Babylon.js + TypeScript + Vite.**
- It is web‑native, so it has the smallest download, fastest load and best mobile‑browser story, and it deploys to Pages and itch with zero tricks.
- It is a real game engine (not just a renderer), with the things this game needs built in.
- The backend SDKs are first‑class JavaScript, which matters because accounts and the shared map are core features.
- Everything is code and data in the repo, so it's easy to review, diff, test and build together (including with Claude).

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

### 6.4 Backend [D9]
Static hosts can't store accounts or shared state, so we need a hosted backend. Both options below have usable free tiers.

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

### 6.5 Data model sketch (Supabase)
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
- **Cloud:** meta progression (credits, unlocks, upgrades) lives server‑side, changed only by edge functions.
- **Local:** settings, keybinds, and a guest profile in `localStorage`/IndexedDB.
- **Guest → account upgrade:** let people play immediately as a guest (Supabase anonymous auth) and link an account later
  without losing progress. Forced sign‑up before the first run kills web conversion **[D10]**.
- **Versioned save schema** with migrations from day one.

---

## 7. Things you didn't list but will need

### 7.1 Anti‑cheat (for the shared map)
Any browser game can be modified, so assume the client can lie. The goal is to make cheating **pointless for the shared map**, not impossible.
1. **Server‑authoritative economy:** credits and zone control are computed server‑side from submitted results; the client never sets them.
2. **Plausibility checks in `finish_run`:** wall‑clock duration vs. claimed duration (server timestamp from `start_run`), max
   kills/XP per minute for the tier, valid ship/loadout for that account, one active run per account, client version check.
3. **Caps:** per‑player contribution cap per zone per day (§4.3) and run submission rate limits.
4. **Flagging, not instant bans:** suspicious runs are stored with `flags`, give no contribution, and get reviewed.
5. **Later, if needed:** deterministic sim plus input recording, so the server can replay suspicious runs from seed + inputs.
Because the game is co‑op (no PvP, no leaderboard money), the stakes are low; points 1 to 3 are enough for launch.

### 7.2 Performance with many enemies
- Budget: **60 fps on a mid laptop with 500+ enemies and 1,000+ projectiles**, and 30 fps on mid phones with reduced caps.
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
- Log anonymous run telemetry to the backend: ship, zone tier, death time, cause of death, upgrades picked/skipped, credits earned.
  This is **the** tool for balancing a survivors‑like.
- Product analytics: prefer **cookie‑less, privacy‑friendly** options (own Supabase table, Plausible, or self‑hosted Umami) so no cookie banner is needed.
- Error reporting (e.g. Sentry free tier) for browser crashes.

### 7.6 Legal and privacy (you're in Germany/EU, so GDPR applies)
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
- **Monetization [D12]:** free, donations (itch "pay what you want"), cosmetics, or paid. This affects which asset licences are allowed (no "NC" assets if you ever charge).
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
| **M2: Map (offline)** | Conquest structure | Solar map (1 system), 2 planets/biomes, tactical zone map with adjacency, depth → difficulty tiers; mock zone state stored locally | Picking zones changes the mission |
| **M3: Online** | Shared war | Supabase project (EU); guest + account login; cloud save; `start_run`/`finish_run` with validation; capped contribution; zone flipping; realtime map updates; faction push‑back job | Two people on different PCs move the same zone |
| **M4: Public beta** | Release on itch.io | 3 factions, 3 biomes, 3 ships; settings/accessibility; telemetry + error reporting; privacy policy/Impressum/deletion; touch controls; itch page | Public itch.io release |
| **M5: Live** | Retention | Seasons, events, more systems/planets, cosmetics, news panel, optional real‑time co‑op research | Ongoing |

Rough order of difficulty: M0 and M1 are the bulk of the *game* work, and M3 is the bulk of the *online* work. M0 is a few focused sessions.

---

## 10. Decisions for Andre

You can answer these one by one; the recommendation is what we'll assume until you say otherwise.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Mission length | 8 / 12 / 15 / 30 min | **12 min** |
| **D2** | Weapon aiming | Arcs per hardpoint (steering aims) / 360° auto‑aim | **Arcs** for broadside guns, turrets 360° |
| **D3** | Role of resources | As in §3.4 / resources also feed level‑ups / other | **§3.4 proposal** |
| **D4** | Zone capture rule | Control % with capped contributions (scaled to players) / fixed number of players | **Control % + caps + scaling** |
| **D5** | Seasons | Persistent map / resets every 4–8 weeks / rotate solar systems | **Seasons (~6 weeks)**, decide after M3 |
| **D6** | Real‑time co‑op in missions | No (shared map only) / later stretch goal | **Shared map only for MVP** |
| **D7** | Engine | Babylon.js / Three.js / Godot 4 / Unity | **Babylon.js + TypeScript**; Godot if you want a visual editor |
| **D8** | Hosting | GitHub Pages / itch.io / both | **Both** (Pages = dev, itch = public) |
| **D9** | Backend | Supabase / Firebase / other | **Supabase (EU region)** |
| **D10** | Login | Required at start / guest first, link account later | **Guest first** |
| **D11** | Platforms | Desktop only / desktop first, touch‑ready / mobile first | **Desktop first, touch‑ready** |
| **D12** | Monetization | Free / donations / cosmetics / paid | **Free + donations**, decide before M4 |
| **D13** | Art style | Stylized low‑poly / realistic PBR / other | **Stylized low‑poly** |
| **D14** | Final names | Keep placeholders until M4 | **Keep placeholders**, trademark check before naming |

**Next step after decisions:** start **M0** (repo scaffold, CI deploy to GitHub Pages, greybox ship, movement and camera).
