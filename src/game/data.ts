// All balance numbers live here so tuning needs no code changes elsewhere (SPEC §6.2 "data-driven content").

export type Targeting = 'nearest' | 'heaviest' | 'cluster' | 'spread' | 'around' | 'projectiles';
export type WeaponId = 'pulse' | 'missile' | 'rail' | 'flak' | 'arc' | 'shock' | 'pd';

export interface WeaponLevel {
  dmg: number;
  cd: number; // seconds between shots/salvos
  count: number; // bolts / missiles / chain jumps, meaning depends on weapon
  range: number;
  speed?: number;
  aoe?: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  desc: string;
  targeting: Targeting;
  color: [number, number, number];
  /** Indexes into PLAYER_HARDPOINTS. Empty = fires from the ship centre (no turret). */
  hardpoints: number[];
  levels: WeaponLevel[];
  levelText: string[];
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pulse: {
    id: 'pulse',
    name: 'Pulse Laser',
    desc: 'Fast bolts at the nearest enemy.',
    targeting: 'nearest',
    color: [0.35, 0.85, 1],
    hardpoints: [0, 1, 2, 3],
    levels: [
      { dmg: 9, cd: 0.55, count: 2, range: 270, speed: 520 },
      { dmg: 11, cd: 0.5, count: 2, range: 280, speed: 540 },
      { dmg: 12, cd: 0.45, count: 3, range: 290, speed: 560 },
      { dmg: 15, cd: 0.4, count: 3, range: 300, speed: 580 },
      { dmg: 18, cd: 0.33, count: 4, range: 320, speed: 620 },
    ],
    levelText: ['2 turrets', '+damage, faster', '3 turrets', '+damage, faster', '4 turrets, max power'],
  },
  missile: {
    id: 'missile',
    name: 'Missile Pod',
    desc: 'Homing salvos spread across different targets.',
    targeting: 'spread',
    color: [1, 0.55, 0.2],
    hardpoints: [4, 5],
    levels: [
      { dmg: 16, cd: 2.4, count: 3, range: 420, speed: 230, aoe: 16 },
      { dmg: 18, cd: 2.2, count: 4, range: 430, speed: 240, aoe: 18 },
      { dmg: 21, cd: 2.0, count: 5, range: 440, speed: 250, aoe: 20 },
      { dmg: 24, cd: 1.8, count: 6, range: 460, speed: 260, aoe: 22 },
      { dmg: 30, cd: 1.5, count: 8, range: 480, speed: 280, aoe: 26 },
    ],
    levelText: ['3 missiles per salvo', '4 missiles', '5 missiles, +damage', '6 missiles, faster reload', '8 missiles, bigger blasts'],
  },
  rail: {
    id: 'rail',
    name: 'Rail Battery',
    desc: 'Piercing slug that punches through a line of ships. Targets the toughest enemy.',
    targeting: 'heaviest',
    color: [0.75, 0.6, 1],
    hardpoints: [6],
    levels: [
      { dmg: 55, cd: 2.8, count: 1, range: 520 },
      { dmg: 70, cd: 2.6, count: 1, range: 540 },
      { dmg: 90, cd: 2.3, count: 1, range: 560 },
      { dmg: 110, cd: 2.1, count: 2, range: 580 },
      { dmg: 150, cd: 1.8, count: 2, range: 620 },
    ],
    levelText: ['1 slug', '+damage', '+damage, faster', 'second rail', 'max damage'],
  },
  flak: {
    id: 'flak',
    name: 'Flak Cannon',
    desc: 'Shells that burst inside the densest cluster of enemies.',
    targeting: 'cluster',
    color: [1, 0.85, 0.35],
    hardpoints: [7, 8],
    levels: [
      { dmg: 20, cd: 1.6, count: 1, range: 320, speed: 340, aoe: 38 },
      { dmg: 24, cd: 1.5, count: 2, range: 330, speed: 350, aoe: 42 },
      { dmg: 28, cd: 1.35, count: 2, range: 340, speed: 360, aoe: 48 },
      { dmg: 34, cd: 1.2, count: 2, range: 350, speed: 370, aoe: 54 },
      { dmg: 42, cd: 1.0, count: 3, range: 370, speed: 390, aoe: 62 },
    ],
    levelText: ['1 shell', '2 shells', 'bigger bursts', '+damage, faster', '3 shells, huge bursts'],
  },
  arc: {
    id: 'arc',
    name: 'Arc Zapper',
    desc: 'Lightning that jumps between nearby enemies.',
    targeting: 'cluster',
    color: [0.55, 0.75, 1],
    hardpoints: [9],
    levels: [
      { dmg: 14, cd: 1.3, count: 3, range: 240, aoe: 90 },
      { dmg: 16, cd: 1.2, count: 4, range: 250, aoe: 95 },
      { dmg: 19, cd: 1.1, count: 5, range: 260, aoe: 100 },
      { dmg: 23, cd: 1.0, count: 6, range: 270, aoe: 110 },
      { dmg: 28, cd: 0.8, count: 8, range: 290, aoe: 120 },
    ],
    levelText: ['3 jumps', '4 jumps', '5 jumps, +damage', '6 jumps', '8 jumps, faster'],
  },
  shock: {
    id: 'shock',
    name: 'Shockwave Emitter',
    desc: 'Periodic ring around the ship that damages and pushes enemies back.',
    targeting: 'around',
    color: [0.5, 1, 0.85],
    hardpoints: [],
    levels: [
      { dmg: 18, cd: 4.2, count: 1, range: 120 },
      { dmg: 22, cd: 3.9, count: 1, range: 135 },
      { dmg: 27, cd: 3.6, count: 1, range: 150 },
      { dmg: 33, cd: 3.2, count: 1, range: 165 },
      { dmg: 42, cd: 2.6, count: 1, range: 190 },
    ],
    levelText: ['ring of 120', 'wider, +damage', 'wider', 'wider, faster', 'max radius'],
  },
  pd: {
    id: 'pd',
    name: 'Point Defense',
    desc: 'Rapid short-range guns. Shoots down enemy missiles first.',
    targeting: 'projectiles',
    color: [1, 1, 0.75],
    hardpoints: [10, 11],
    levels: [
      { dmg: 4, cd: 0.16, count: 1, range: 130, speed: 700 },
      { dmg: 5, cd: 0.14, count: 1, range: 140, speed: 700 },
      { dmg: 6, cd: 0.12, count: 1, range: 150, speed: 720 },
      { dmg: 7, cd: 0.1, count: 2, range: 160, speed: 740 },
      { dmg: 9, cd: 0.08, count: 2, range: 180, speed: 760 },
    ],
    levelText: ['2 guns', '+damage', '+range', 'double shots', 'max fire rate'],
  },
};

/** Turret mounts on the battlecruiser hull, in unscaled model units (x right, z forward, y up). */
export const PLAYER_HARDPOINTS: { x: number; y: number; z: number }[] = [
  { x: -1.9, y: 1.15, z: 4.5 }, // 0 pulse fwd L
  { x: 1.9, y: 1.15, z: 4.5 }, // 1 pulse fwd R
  { x: -2.4, y: 1.0, z: -1.5 }, // 2 pulse mid L
  { x: 2.4, y: 1.0, z: -1.5 }, // 3 pulse mid R
  { x: -2.2, y: 1.1, z: -5.6 }, // 4 missiles L
  { x: 2.2, y: 1.1, z: -5.6 }, // 5 missiles R
  { x: 0, y: 1.55, z: 2.0 }, // 6 rail spine
  { x: -2.9, y: 0.8, z: 1.5 }, // 7 flak L
  { x: 2.9, y: 0.8, z: 1.5 }, // 8 flak R
  { x: 0, y: 1.6, z: -3.2 }, // 9 arc
  { x: -1.3, y: 1.1, z: 7.4 }, // 10 pd nose L
  { x: 1.3, y: 1.1, z: 7.4 }, // 11 pd nose R
];

export type PassiveId = 'hull' | 'armor' | 'damage' | 'firerate' | 'engine' | 'magnet' | 'regen';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  desc: string;
  max: number;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  hull: { id: 'hull', name: 'Reinforced Hull', desc: '+20% max hull, repairs 20%', max: 5 },
  armor: { id: 'armor', name: 'Armor Plating', desc: '-1.5 damage from every hit', max: 5 },
  damage: { id: 'damage', name: 'Targeting Computer', desc: '+10% weapon damage', max: 5 },
  firerate: { id: 'firerate', name: 'Capacitor Banks', desc: '+8% fire rate', max: 5 },
  engine: { id: 'engine', name: 'Engine Overhaul', desc: '+8% speed and turn rate', max: 5 },
  magnet: { id: 'magnet', name: 'Combat Analyzer', desc: '+15% XP from kills', max: 5 },
  regen: { id: 'regen', name: 'Nano-Repair', desc: '+0.8 hull per second', max: 5 },
};

export const MAX_WEAPONS = 5;
export const MAX_PASSIVES = 5;

export type Behaviour = 'chase' | 'shooter' | 'kamikaze' | 'gunship' | 'bomber' | 'carrier' | 'boss';

export interface EnemyDef {
  id: string;
  model: string;
  behaviour: Behaviour;
  hp: number;
  speed: number;
  turn: number; // rad/s
  radius: number;
  scale: number;
  contactDmg: number;
  xp: number;
  credits: number;
  range?: number;
  fireCd?: number;
  projSpeed?: number;
  projDmg?: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  striker: { id: 'striker', model: 'enemy_fighter_striker', behaviour: 'chase', hp: 14, speed: 72, turn: 3.2, radius: 7.2, scale: 1.6, contactDmg: 6, xp: 1, credits: 0.4 },
  dispatcher: { id: 'dispatcher', model: 'enemy_fighter_dispatcher', behaviour: 'chase', hp: 22, speed: 62, turn: 2.8, radius: 8, scale: 1.6, contactDmg: 8, xp: 1, credits: 0.5 },
  insurgent: { id: 'insurgent', model: 'enemy_fighter_insurgent', behaviour: 'shooter', hp: 20, speed: 66, turn: 2.6, radius: 8, scale: 1.6, contactDmg: 6, xp: 2, credits: 0.6, range: 180, fireCd: 2.8, projSpeed: 170, projDmg: 4 },
  zenith: { id: 'zenith', model: 'enemy_fighter_zenith', behaviour: 'shooter', hp: 30, speed: 58, turn: 2.4, radius: 8.8, scale: 1.6, contactDmg: 6, xp: 2, credits: 0.7, range: 220, fireCd: 2.4, projSpeed: 190, projDmg: 5 },
  spitfire: { id: 'spitfire', model: 'enemy_fighter_spitfire', behaviour: 'kamikaze', hp: 12, speed: 118, turn: 2.0, radius: 8, scale: 1.6, contactDmg: 12, xp: 1, credits: 0.5 },
  challenger: { id: 'challenger', model: 'enemy_gunship_challenger', behaviour: 'gunship', hp: 130, speed: 40, turn: 1.4, radius: 12.4, scale: 2.17, contactDmg: 12, xp: 5, credits: 2, range: 240, fireCd: 3.4, projSpeed: 180, projDmg: 5 },
  executioner: { id: 'executioner', model: 'enemy_gunship_executioner', behaviour: 'gunship', hp: 110, speed: 46, turn: 1.6, radius: 12.4, scale: 2.17, contactDmg: 12, xp: 5, credits: 2, range: 200, fireCd: 3.0, projSpeed: 200, projDmg: 4 },
  bob: { id: 'bob', model: 'enemy_bomber_bob', behaviour: 'bomber', hp: 100, speed: 38, turn: 1.3, radius: 12.4, scale: 2.17, contactDmg: 12, xp: 5, credits: 2, range: 360, fireCd: 5, projSpeed: 120, projDmg: 16 },
  omen: { id: 'omen', model: 'enemy_frigate_omen', behaviour: 'carrier', hp: 520, speed: 24, turn: 0.7, radius: 21.8, scale: 3.19, contactDmg: 20, xp: 14, credits: 8, range: 300, fireCd: 7, projSpeed: 0, projDmg: 0 },
  pancake: { id: 'pancake', model: 'enemy_frigate_pancake', behaviour: 'gunship', hp: 450, speed: 26, turn: 0.8, radius: 18.8, scale: 3.19, contactDmg: 20, xp: 12, credits: 7, range: 280, fireCd: 2.4, projSpeed: 170, projDmg: 6 },
  // Mini-boss and boss: the only enemies close to the player's size (SPEC §3.5).
  elite: { id: 'elite', model: 'enemy_frigate_omen', behaviour: 'boss', hp: 2000, speed: 22, turn: 0.6, radius: 32.5, scale: 4.5, contactDmg: 25, xp: 50, credits: 60, range: 320, fireCd: 2.8, projSpeed: 150, projDmg: 5 },
  boss: { id: 'boss', model: 'enemy_cruiser', behaviour: 'boss', hp: 7000, speed: 20, turn: 0.45, radius: 36, scale: 4.08, contactDmg: 30, xp: 120, credits: 150, range: 360, fireCd: 2.2, projSpeed: 160, projDmg: 6 },
};

export const PLAYER_BASE = {
  hull: 800,
  speed: 42,
  accel: 11,
  turn: 0.32,
  magnet: 95,
  regen: 0.5,
  scale: 7,
  /** Collision circles along the hull (unscaled z offsets, radius in world units). */
  circles: [-6.5, -1, 4.5] as number[],
  circleRadius: 22,
  boostMult: 1.9,
  boostTime: 2.5,
  boostCd: 12,
};

// ----- Meta progression (credits) -----

export type MetaId = 'm_hull' | 'm_damage' | 'm_firerate' | 'm_engine' | 'm_magnet' | 'm_salvage' | 'm_reroll' | 'm_armor';

export interface MetaDef {
  id: MetaId;
  name: string;
  desc: string;
  max: number;
  cost: (level: number) => number; // cost to buy the next level, given current level
}

const costCurve = (base: number, growth: number) => (lvl: number) => Math.round(base * Math.pow(growth, lvl));

export const META: Record<MetaId, MetaDef> = {
  m_hull: { id: 'm_hull', name: 'Hull Plating', desc: '+8% max hull per level', max: 10, cost: costCurve(60, 1.45) },
  m_armor: { id: 'm_armor', name: 'Ablative Armor', desc: '-0.5 damage from every hit per level', max: 6, cost: costCurve(90, 1.55) },
  m_damage: { id: 'm_damage', name: 'Weapon Calibration', desc: '+5% weapon damage per level', max: 10, cost: costCurve(80, 1.45) },
  m_firerate: { id: 'm_firerate', name: 'Reactor Output', desc: '+4% fire rate per level', max: 8, cost: costCurve(90, 1.5) },
  m_engine: { id: 'm_engine', name: 'Thrusters', desc: '+5% speed per level', max: 6, cost: costCurve(70, 1.5) },
  m_magnet: { id: 'm_magnet', name: 'Battle Records', desc: '+6% XP from kills per level', max: 6, cost: costCurve(50, 1.45) },
  m_salvage: { id: 'm_salvage', name: 'War Bonds', desc: '+8% credits from every mission', max: 8, cost: costCurve(100, 1.55) },
  m_reroll: { id: 'm_reroll', name: 'Tactical Officer', desc: '+1 level-up reroll per mission', max: 3, cost: costCurve(150, 2.2) },
};

// ----- Factions, planets and zones -----

export type FactionId = 'alliance' | 'concord' | 'swarm' | 'void';

export const FACTIONS: Record<FactionId, { name: string; color: [number, number, number] }> = {
  alliance: { name: 'Alliance*', color: [0.25, 0.6, 1] },
  concord: { name: 'Iron Concord*', color: [0.95, 0.22, 0.2] },
  swarm: { name: 'Swarm*', color: [1, 0.6, 0.12] },
  void: { name: 'Void Cult*', color: [0.7, 0.3, 1] },
};

export type PlanetId = 'megacity' | 'ocean';

export interface PlanetDef {
  id: PlanetId;
  name: string;
  blurb: string;
  /** Seed for the zone map, so every player gets the same map. */
  seed: number;
  /** Zone sites per row and column on the tactical map. */
  grid: { cols: number; rows: number };
  /** Tier of the zones right on the Alliance border; deeper zones get harder. */
  baseTier: number;
  /** Where the Alliance beachhead sits (map units, 1.4 x 1) and how many zones it holds at the start. */
  alliance: { at: [number, number]; size: number };
  /** Enemy factions: capital position on the map and how aggressively they grow when the map is made. */
  factions: { id: FactionId; capital: [number, number]; weight: number }[];
  names: string[];
  /** Solar system screen: orbit radius, planet size and orbit speed. */
  orbit: { radius: number; size: number; speed: number; phase: number };
}

export const PLANETS: PlanetDef[] = [
  {
    id: 'megacity',
    name: 'Megacity*',
    blurb: 'One endless metropolis. The Iron Concord and the Void Cult fight over the towers.',
    seed: 1207,
    grid: { cols: 7, rows: 6 },
    baseTier: 1,
    alliance: { at: [0.12, 0.55], size: 4 },
    factions: [
      { id: 'concord', capital: [0.7, 0.25], weight: 1.2 },
      { id: 'void', capital: [1.22, 0.75], weight: 1.5 },
    ],
    names: [
      'Spire District', 'Neon Docks', 'Core Arcology', 'Old Foundry', 'Skybridge Row', 'Glass Canyon', 'Transit Hub', 'Lantern Ward',
      'Iron Market', 'Sublevel Nine', 'Chrome Heights', 'Reactor Block', 'Harbor Stacks', 'The Undercity', 'Signal Tower', 'Pylon Fields',
      'Ash Quarter', 'Copper Gardens', 'Data Vaults', 'Twin Spires', 'Grid Sector', 'Rust Belt', 'Highline', 'Sunken Plaza',
      'Archive Hill', 'Foundry Gate', 'Neon Strip', 'Cathedral Ward', 'Mag-Rail Yards', 'Smog Basin', 'Black Terrace', 'Cobalt Row',
      'Ember District', 'Silent Blocks', 'Dome Market', 'Vertigo Heights', 'Overpass', 'Kiln Ward', 'Echo Station', 'Prism Tower',
      'Vapor Lanes', 'Steel Gardens', 'Beacon Ward', 'Last Light',
    ],
    orbit: { radius: 200, size: 36, speed: 0.05, phase: 0.6 },
  },
  {
    id: 'ocean',
    name: 'Ocean*',
    blurb: 'Nothing but water, platforms and wrecks. Three factions contest the sea lanes.',
    seed: 3301,
    grid: { cols: 7, rows: 6 },
    baseTier: 2,
    alliance: { at: [0.1, 0.3], size: 3 },
    factions: [
      { id: 'swarm', capital: [0.66, 0.7], weight: 0.9 },
      { id: 'concord', capital: [1.27, 0.2], weight: 1.2 },
      { id: 'void', capital: [1.14, 0.85], weight: 1.5 },
    ],
    names: [
      'Reef Platforms', 'Storm Belt', 'Abyssal Rig', 'Coral Shelf', 'Driftwood Atoll', 'Tidal Gate', 'Brine Fields', 'Wreck Cove',
      'Kelp Expanse', 'Pearl Shoals', 'Gale Point', 'Deepwater Rig', 'Saltspray Lanes', 'Lighthouse Key', 'Maelstrom', 'Foam Reach',
      'Sunken Fleet', 'Trench Line', 'Mirror Sea', 'Harpoon Bay', 'Siren Rocks', 'Thunder Shallows', 'Blue Hollow', 'Hydro Station',
      'Breaker Reef', 'Ghost Buoys', 'Leviathan Deep', 'Spindrift', 'Undertow', 'Rain Wall', 'Coldwater Rig', 'Black Tide',
      'Gull Islands', 'Pressure Point', 'Typhoon Eye', 'Riptide', 'Anchor Field', 'Glass Lagoon', 'Iceberg Lane', 'Far Shoals',
      'Squall Line', 'Sonar Array', 'Tide Pools', 'Wavebreak',
    ],
    orbit: { radius: 320, size: 44, speed: 0.032, phase: 3.4 },
  },
];

/** Regular mission timer by zone tier, in seconds (SPEC §3.1). */
export function missionDuration(tier: number): number {
  return [0, 8, 10, 12, 15, 18][Math.min(tier, 5)] * 60;
}

export function tierHpMult(tier: number): number {
  return 1 + (tier - 1) * 0.4;
}

export function tierDmgMult(tier: number): number {
  return 1 + (tier - 1) * 0.15;
}

export const CONTROL = { win: 35, bossBonus: 10, lossMax: 10 };

export function xpForLevel(level: number): number {
  return Math.round(5 + level * 4 + level * level * 0.55);
}
