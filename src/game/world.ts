// Mission simulation on the 2D XZ plane. No Babylon imports here: the renderer reads this state every frame.
import { Rng } from './rng';
import {
  ENEMIES,
  EnemyDef,
  MAX_PASSIVES,
  MAX_WEAPONS,
  PASSIVES,
  PassiveId,
  PLAYER_BASE,
  PLAYER_HARDPOINTS,
  WEAPONS,
  WeaponId,
  tierDmgMult,
  tierHpMult,
  xpForLevel,
} from './data';

export const DT = 1 / 60;
export const SPAWN_DIST = 560;
const DESPAWN_DIST = 1150;
const MAX_ENEMIES = 150;
const MAX_SHARDS = 260;

export interface MetaBonuses {
  hull: number; // levels
  armor: number;
  damage: number;
  firerate: number;
  engine: number;
  magnet: number;
  rerolls: number;
}

export const NO_META: MetaBonuses = { hull: 0, armor: 0, damage: 0, firerate: 0, engine: 0, magnet: 0, rerolls: 0 };

export interface Input {
  /** Desired move direction in world XZ, length 0..1. */
  mx: number;
  mz: number;
  boost: boolean;
}

export interface Enemy {
  uid: number;
  def: EnemyDef;
  x: number;
  z: number;
  px: number;
  pz: number;
  heading: number;
  kvx: number; // knockback velocity
  kvz: number;
  hp: number;
  maxHp: number;
  radius: number;
  scale: number;
  alive: boolean;
  fireCd: number;
  spawnCd: number;
  wingTime: number;
  wingX: number;
  wingZ: number;
  orbitDir: number;
  ox: number; // per-enemy aim offset around the hull so fighters swarm the whole ship
  oz: number;
  contactCd: number;
  /** After touching the hull a fighter peels away and loops back for another run. */
  peel: number;
  dmgMult: number;
  isBoss: boolean;
  flash: number;
  view?: unknown; // renderer slot
}

export type ProjKind = 'pulse' | 'missile' | 'flak' | 'pd' | 'ebolt' | 'emissile';

export interface Projectile {
  kind: ProjKind;
  x: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  speed: number;
  life: number;
  dmg: number;
  radius: number;
  aoe: number;
  target: Enemy | null;
  tx: number;
  tz: number;
  hp: number;
  alive: boolean;
}

export type PickupKind = 'xp' | 'repair' | 'magnet';

export interface Pickup {
  kind: PickupKind;
  x: number;
  z: number;
  px: number;
  pz: number;
  value: number;
  pulled: boolean;
  speed: number;
  alive: boolean;
}

export type GameEvent =
  | { type: 'explosion'; x: number; z: number; size: number }
  | { type: 'hit'; x: number; z: number; enemy: boolean }
  | { type: 'beam'; x1: number; z1: number; x2: number; z2: number; color: [number, number, number]; width: number; life: number }
  | { type: 'shock'; x: number; z: number; r: number }
  | { type: 'muzzle'; x: number; z: number; color: [number, number, number] }
  | { type: 'sound'; id: string; vol: number }
  | { type: 'shake'; amt: number }
  | { type: 'announce'; text: string }
  | { type: 'levelup' }
  | { type: 'timer' };

export interface OwnedWeapon {
  id: WeaponId;
  level: number;
  cd: number;
}

export type Choice =
  | { kind: 'weapon'; id: WeaponId; level: number }
  | { kind: 'passive'; id: PassiveId; level: number }
  | { kind: 'heal' }
  | { kind: 'credits' };

export interface Player {
  x: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  heading: number;
  pheading: number;
  hull: number;
  maxHull: number;
  level: number;
  xp: number;
  xpNext: number;
  weapons: OwnedWeapon[];
  passives: Partial<Record<PassiveId, number>>;
  /** World-space aim angle per hardpoint; NaN = no weapon mounted there. */
  turretAim: number[];
  boostTime: number;
  boostCd: number;
  hitFlash: number;
}

export interface WorldOptions {
  seed: number;
  tier: number;
  duration: number;
  meta: MetaBonuses;
}

export class World {
  readonly rng: Rng;
  readonly tier: number;
  readonly duration: number;
  readonly meta: MetaBonuses;
  t = 0;
  player: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  events: GameEvent[] = [];
  kills = 0;
  enemyCredits = 0;
  bonusCredits = 0;
  pendingLevelUps = 0;
  rerolls: number;
  timerReached = false;
  endless = false;
  over = false;
  bossKilled = false;
  bossSpawned = false;
  boss: Enemy | null = null;

  private uid = 1;
  private grid = new Grid(48);
  private wingTimer = 4;
  private trickleTimer = 0;
  private frigateTimer = 190;
  private miniBossTimes: number[];
  private bossTime: number;
  private enemyPool: Enemy[] = [];
  private projPool: Projectile[] = [];
  private pickupPool: Pickup[] = [];
  private tmp: Enemy[] = [];

  constructor(opts: WorldOptions) {
    this.rng = new Rng(opts.seed);
    this.tier = opts.tier;
    this.duration = opts.duration;
    this.meta = opts.meta;
    this.rerolls = opts.meta.rerolls;
    const maxHull = PLAYER_BASE.hull * (1 + 0.08 * opts.meta.hull);
    this.player = {
      x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, heading: 0, pheading: 0,
      hull: maxHull, maxHull, level: 1, xp: 0, xpNext: xpForLevel(1),
      weapons: [{ id: 'pulse', level: 1, cd: 0.5 }],
      passives: {},
      turretAim: PLAYER_HARDPOINTS.map(() => NaN),
      boostTime: 0, boostCd: 0, hitFlash: 0,
    };
    this.miniBossTimes = opts.duration >= 180 ? [opts.duration / 3, (opts.duration * 2) / 3] : [opts.duration / 2];
    this.bossTime = Math.max(opts.duration - 60, opts.duration * 0.75);
    this.refreshTurrets();
  }

  // ---------- derived stats ----------
  passive(id: PassiveId): number {
    return this.player.passives[id] ?? 0;
  }
  get dmgMult() {
    return (1 + 0.1 * this.passive('damage')) * (1 + 0.05 * this.meta.damage);
  }
  get rateMult() {
    return (1 + 0.08 * this.passive('firerate')) * (1 + 0.04 * this.meta.firerate);
  }
  get speedMult() {
    return (1 + 0.08 * this.passive('engine')) * (1 + 0.05 * this.meta.engine);
  }
  get magnetRange() {
    return PLAYER_BASE.magnet * (1 + 0.3 * this.passive('magnet')) * (1 + 0.12 * this.meta.magnet);
  }
  get armor() {
    return 1.5 * this.passive('armor') + 0.5 * this.meta.armor;
  }
  get minutes() {
    return this.t / 60;
  }
  get enemyHpMult() {
    const endlessMin = Math.max(0, this.t - this.duration) / 60;
    return tierHpMult(this.tier) * (1 + this.minutes * 0.16) * (1 + endlessMin * 0.3);
  }
  get enemyDmgMult() {
    return tierDmgMult(this.tier) * (1 + this.minutes * 0.03);
  }

  // ---------- main step ----------
  step(input: Input): void {
    if (this.over) return;
    this.t += DT;
    this.stepPlayer(input);
    this.grid.clear();
    for (const e of this.enemies) this.grid.insert(e);
    this.stepWeapons();
    this.stepEnemies();
    this.stepProjectiles();
    this.stepPickups();
    this.stepDirector();
    this.compact();
    if (!this.timerReached && this.t >= this.duration) {
      this.timerReached = true;
      this.events.push({ type: 'timer' });
    }
    if (this.player.hull <= 0) {
      this.player.hull = 0;
      this.over = true;
      this.events.push({ type: 'explosion', x: this.player.x, z: this.player.z, size: 30 });
      this.events.push({ type: 'sound', id: 'low_frequency_explosion_001', vol: 1 });
      this.events.push({ type: 'shake', amt: 3 });
    }
  }

  private stepPlayer(input: Input) {
    const p = this.player;
    p.px = p.x;
    p.pz = p.z;
    p.pheading = p.heading;
    p.hitFlash = Math.max(0, p.hitFlash - DT);
    p.boostCd = Math.max(0, p.boostCd - DT);
    if (input.boost && p.boostCd <= 0) {
      p.boostTime = PLAYER_BASE.boostTime;
      p.boostCd = PLAYER_BASE.boostCd;
      this.events.push({ type: 'sound', id: 'thruster_fire_000', vol: 0.8 });
    }
    const boosting = p.boostTime > 0;
    p.boostTime = Math.max(0, p.boostTime - DT);
    const sm = this.speedMult * (boosting ? PLAYER_BASE.boostMult : 1);
    const maxSpeed = PLAYER_BASE.speed * sm;
    const accel = PLAYER_BASE.accel * sm * (boosting ? 2 : 1);
    const turn = PLAYER_BASE.turn * (1 + 0.08 * this.passive('engine'));
    const mag = Math.hypot(input.mx, input.mz);
    let dvx: number, dvz: number;
    if (mag > 0.05) {
      const want = Math.atan2(input.mx, input.mz);
      p.heading = turnToward(p.heading, want, turn * DT);
      // A capital ship thrusts best along its keel: sideways thrust is weaker, so turning first is faster.
      const align = Math.cos(angleDiff(p.heading, want));
      const eff = 0.5 + 0.5 * Math.max(0, align);
      dvx = (input.mx / Math.max(1, mag)) * maxSpeed * eff - p.vx;
      dvz = (input.mz / Math.max(1, mag)) * maxSpeed * eff - p.vz;
    } else {
      dvx = -p.vx;
      dvz = -p.vz;
    }
    const dvLen = Math.hypot(dvx, dvz);
    const maxDv = (mag > 0.05 ? accel : accel * 0.45) * DT;
    if (dvLen > maxDv) {
      dvx *= maxDv / dvLen;
      dvz *= maxDv / dvLen;
    }
    p.vx += dvx;
    p.vz += dvz;
    p.x += p.vx * DT;
    p.z += p.vz * DT;
    const regen = PLAYER_BASE.regen + 0.8 * this.passive('regen');
    if (regen > 0) p.hull = Math.min(p.maxHull, p.hull + regen * DT);
  }

  /** World positions of the hull collision circles. */
  playerCircles(out: { x: number; z: number }[]): { x: number; z: number }[] {
    const p = this.player;
    const s = Math.sin(p.heading), c = Math.cos(p.heading);
    PLAYER_BASE.circles.forEach((oz, i) => {
      const d = oz * PLAYER_BASE.scale;
      out[i] = { x: p.x + s * d, z: p.z + c * d };
    });
    return out;
  }

  hardpointWorld(i: number): { x: number; z: number } {
    const p = this.player;
    const hp = PLAYER_HARDPOINTS[i];
    const lx = hp.x * PLAYER_BASE.scale, lz = hp.z * PLAYER_BASE.scale;
    const s = Math.sin(p.heading), c = Math.cos(p.heading);
    return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
  }

  /** Damage taken per source, for balancing and the results screen. */
  damageTaken: Record<string, number> = {};

  private damagePlayer(amount: number, source: string) {
    const p = this.player;
    const dmg = Math.max(1, amount * this.enemyDmgMult - this.armor);
    p.hull -= dmg;
    this.damageTaken[source] = (this.damageTaken[source] ?? 0) + dmg;
    p.hitFlash = 0.15;
    this.events.push({ type: 'sound', id: 'impact_metal_000', vol: 0.45 });
    if (dmg > 12) this.events.push({ type: 'shake', amt: Math.min(2, dmg / 20) });
  }

  // ---------- weapons ----------
  private stepWeapons() {
    const p = this.player;
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      const L = def.levels[w.level - 1];
      w.cd -= DT;
      // Turrets track their current target even between shots, so the hull visibly reacts.
      if (w.cd > 0) {
        if (def.targeting !== 'around') this.trackTurrets(w.id, L.range);
        continue;
      }
      const fired = this.fireWeapon(w, L);
      w.cd = fired ? L.cd / this.rateMult : 0.15;
    }
  }

  private trackTurrets(id: WeaponId, range: number) {
    const def = WEAPONS[id];
    for (const hi of def.hardpoints) {
      const hp = this.hardpointWorld(hi);
      const t = this.nearestEnemy(hp.x, hp.z, range * 1.2);
      if (t) this.player.turretAim[hi] = Math.atan2(t.x - hp.x, t.z - hp.z);
    }
  }

  private fireWeapon(w: OwnedWeapon, L: (typeof WEAPONS)['pulse']['levels'][number]): boolean {
    const def = WEAPONS[w.id];
    const p = this.player;
    const dmg = L.dmg * this.dmgMult;
    switch (def.targeting) {
      case 'nearest': {
        // Pulse laser: each active turret fires at the enemy nearest to it.
        let any = false;
        const mounts = def.hardpoints.slice(0, L.count);
        for (const hi of mounts) {
          const hp = this.hardpointWorld(hi);
          const t = this.nearestEnemy(hp.x, hp.z, L.range);
          if (!t) continue;
          const lead = leadTarget(hp.x, hp.z, t, L.speed!);
          const a = Math.atan2(lead.x - hp.x, lead.z - hp.z);
          p.turretAim[hi] = a;
          this.spawnProj('pulse', hp.x, hp.z, a, L.speed!, dmg, L.range / L.speed! + 0.1, 3, 0, null);
          this.events.push({ type: 'muzzle', x: hp.x, z: hp.z, color: def.color });
          any = true;
        }
        if (any) this.events.push({ type: 'sound', id: 'laser_small_000', vol: 0.18 });
        return any;
      }
      case 'spread': {
        const cands = this.enemiesInRange(p.x, p.z, L.range);
        if (!cands.length) return false;
        shuffle(cands, this.rng);
        for (let i = 0; i < L.count; i++) {
          const hi = def.hardpoints[i % def.hardpoints.length];
          const hp = this.hardpointWorld(hi);
          const t = cands[i % cands.length];
          const a = Math.atan2(t.x - hp.x, t.z - hp.z) + this.rng.range(-0.9, 0.9);
          p.turretAim[hi] = Math.atan2(t.x - hp.x, t.z - hp.z);
          this.spawnProj('missile', hp.x, hp.z, a, L.speed! * 0.5, dmg, 4, 3, L.aoe!, t);
        }
        this.events.push({ type: 'sound', id: 'thruster_fire_000', vol: 0.25 });
        return true;
      }
      case 'heaviest': {
        const cands = this.enemiesInRange(p.x, p.z, L.range);
        if (!cands.length) return false;
        cands.sort((a, b) => b.hp - a.hp);
        for (let i = 0; i < L.count; i++) {
          const t = cands[Math.min(i, cands.length - 1)];
          const hp = this.hardpointWorld(def.hardpoints[0]);
          const a = Math.atan2(t.x - hp.x, t.z - hp.z) + (i ? this.rng.range(-0.05, 0.05) : 0);
          p.turretAim[def.hardpoints[0]] = a;
          const ex = hp.x + Math.sin(a) * L.range * 1.4, ez = hp.z + Math.cos(a) * L.range * 1.4;
          for (const e of this.enemies) {
            if (e.alive && distToSegment(e.x, e.z, hp.x, hp.z, ex, ez) < e.radius + 5) this.damageEnemy(e, dmg, true);
          }
          this.events.push({ type: 'beam', x1: hp.x, z1: hp.z, x2: ex, z2: ez, color: def.color, width: 3.2, life: 0.35 });
        }
        this.events.push({ type: 'sound', id: 'laser_large_000', vol: 0.5 });
        return true;
      }
      case 'cluster': {
        const t = this.densestEnemy(p.x, p.z, L.range, w.id === 'arc' ? L.aoe! : 45);
        if (!t) return false;
        if (w.id === 'flak') {
          for (let i = 0; i < L.count; i++) {
            const hi = def.hardpoints[i % def.hardpoints.length];
            const hp = this.hardpointWorld(hi);
            const tx = t.x + (i ? this.rng.range(-30, 30) : 0), tz = t.z + (i ? this.rng.range(-30, 30) : 0);
            const a = Math.atan2(tx - hp.x, tz - hp.z);
            p.turretAim[hi] = a;
            const dist = Math.hypot(tx - hp.x, tz - hp.z);
            const pr = this.spawnProj('flak', hp.x, hp.z, a, L.speed!, dmg, dist / L.speed!, 4, L.aoe!, null);
            pr.tx = tx;
            pr.tz = tz;
            this.events.push({ type: 'muzzle', x: hp.x, z: hp.z, color: def.color });
          }
          this.events.push({ type: 'sound', id: 'laser_retro_001', vol: 0.22 });
        } else {
          // Arc zapper chain
          const hp = this.hardpointWorld(def.hardpoints[0]);
          p.turretAim[def.hardpoints[0]] = Math.atan2(t.x - hp.x, t.z - hp.z);
          const hit = new Set<Enemy>();
          let cur = t;
          let fx = hp.x, fz = hp.z;
          for (let j = 0; j < L.count && cur; j++) {
            hit.add(cur);
            this.events.push({ type: 'beam', x1: fx, z1: fz, x2: cur.x, z2: cur.z, color: def.color, width: 1.6, life: 0.18 });
            fx = cur.x;
            fz = cur.z;
            this.damageEnemy(cur, dmg, true);
            let next: Enemy | null = null, best = L.aoe! * L.aoe!;
            for (const e of this.grid.query(fx, fz, L.aoe!, this.tmp)) {
              if (!e.alive || hit.has(e)) continue;
              const d = (e.x - fx) ** 2 + (e.z - fz) ** 2;
              if (d < best) { best = d; next = e; }
            }
            cur = next!;
          }
          this.events.push({ type: 'sound', id: 'force_field_002', vol: 0.25 });
        }
        return true;
      }
      case 'around': {
        const any = this.nearestEnemy(p.x, p.z, L.range + 20);
        if (!any) return false;
        for (const e of this.grid.query(p.x, p.z, L.range + 30, this.tmp)) {
          if (!e.alive) continue;
          const dx = e.x - p.x, dz = e.z - p.z;
          const d = Math.hypot(dx, dz) || 1;
          if (d - e.radius > L.range) continue;
          this.damageEnemy(e, dmg, true);
          const push = 260 / Math.max(1, e.scale * e.scale);
          e.kvx += (dx / d) * push;
          e.kvz += (dz / d) * push;
        }
        this.events.push({ type: 'shock', x: p.x, z: p.z, r: L.range });
        this.events.push({ type: 'sound', id: 'force_field_000', vol: 0.4 });
        return true;
      }
      case 'projectiles': {
        // Point defense: enemy missiles first, then the nearest enemy.
        let fired = false;
        for (let k = 0; k < def.hardpoints.length; k++) {
          const hi = def.hardpoints[k];
          const hp = this.hardpointWorld(hi);
          let tx = 0, tz = 0, found = false, best = L.range * L.range;
          for (const pr of this.projectiles) {
            if (!pr.alive || pr.kind !== 'emissile') continue;
            const d = (pr.x - hp.x) ** 2 + (pr.z - hp.z) ** 2;
            if (d < best) { best = d; tx = pr.x; tz = pr.z; found = true; }
          }
          if (!found) {
            const e = this.nearestEnemy(hp.x, hp.z, L.range);
            if (e) { tx = e.x; tz = e.z; found = true; }
          }
          if (!found) continue;
          for (let n = 0; n < L.count; n++) {
            const a = Math.atan2(tx - hp.x, tz - hp.z) + this.rng.range(-0.06, 0.06);
            p.turretAim[hi] = a;
            this.spawnProj('pd', hp.x, hp.z, a, L.speed!, dmg, L.range / L.speed! + 0.05, 2.5, 0, null);
          }
          fired = true;
        }
        if (fired && this.rng.chance(0.3)) this.events.push({ type: 'sound', id: 'laser_small_002', vol: 0.08 });
        return fired;
      }
    }
  }

  nearestEnemy(x: number, z: number, range: number): Enemy | null {
    let best: Enemy | null = null, bd = range * range;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private enemiesInRange(x: number, z: number, range: number): Enemy[] {
    const r2 = range * range;
    return this.enemies.filter((e) => e.alive && (e.x - x) ** 2 + (e.z - z) ** 2 < r2);
  }

  private densestEnemy(x: number, z: number, range: number, radius: number): Enemy | null {
    const cands = this.enemiesInRange(x, z, range);
    if (!cands.length) return null;
    let best = cands[0], bestN = -1;
    const step = Math.max(1, Math.floor(cands.length / 30));
    for (let i = 0; i < cands.length; i += step) {
      const c = cands[i];
      let n = 0;
      for (const e of this.grid.query(c.x, c.z, radius, this.tmp)) {
        if (e.alive && (e.x - c.x) ** 2 + (e.z - c.z) ** 2 < radius * radius) n += 1 + e.radius / 10;
      }
      if (n > bestN) { bestN = n; best = c; }
    }
    return best;
  }

  private spawnProj(kind: ProjKind, x: number, z: number, a: number, speed: number, dmg: number, life: number, radius: number, aoe: number, target: Enemy | null): Projectile {
    const pr = this.projPool.pop() ?? ({} as Projectile);
    pr.kind = kind;
    pr.x = pr.px = x;
    pr.z = pr.pz = z;
    pr.vx = Math.sin(a) * speed;
    pr.vz = Math.cos(a) * speed;
    pr.speed = speed;
    pr.life = life;
    pr.dmg = dmg;
    pr.radius = radius;
    pr.aoe = aoe;
    pr.target = target;
    pr.tx = pr.tz = 0;
    pr.hp = 1;
    pr.alive = true;
    this.projectiles.push(pr);
    return pr;
  }

  private damageEnemy(e: Enemy, dmg: number, quietHit = false) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.flash = 0.08;
    if (!quietHit && this.rng.chance(0.5)) this.events.push({ type: 'hit', x: e.x, z: e.z, enemy: true });
    if (e.hp <= 0) this.killEnemy(e);
  }

  private aoeDamage(x: number, z: number, r: number, dmg: number) {
    for (const e of this.grid.query(x, z, r + 30, this.tmp)) {
      if (e.alive && Math.hypot(e.x - x, e.z - z) < r + e.radius) this.damageEnemy(e, dmg, true);
    }
    this.events.push({ type: 'explosion', x, z, size: r / 12 });
  }

  private killEnemy(e: Enemy) {
    e.alive = false;
    this.kills++;
    this.enemyCredits += e.def.credits;
    const big = e.radius > 15;
    this.events.push({ type: 'explosion', x: e.x, z: e.z, size: e.radius / 3 });
    this.events.push({ type: 'sound', id: big ? 'low_frequency_explosion_000' : this.rng.chance(0.5) ? 'explosion_crunch_000' : 'explosion_crunch_002', vol: big ? 0.9 : 0.3 });
    if (big) this.events.push({ type: 'shake', amt: e.isBoss ? 3 : 1 });
    // XP shards: big ships drop several so the pickup feels like a jackpot.
    const shards = e.isBoss ? 16 : big ? 4 : 1;
    for (let i = 0; i < shards; i++) {
      const a = this.rng.range(0, Math.PI * 2), r = shards > 1 ? this.rng.range(5, e.radius * 1.5) : 0;
      this.dropPickup('xp', e.x + Math.sin(a) * r, e.z + Math.cos(a) * r, e.def.xp / shards);
    }
    if (e.isBoss) {
      this.dropPickup('repair', e.x, e.z, 0.35);
      this.dropPickup('magnet', e.x + 15, e.z, 0);
    } else if (big ? this.rng.chance(0.25) : e.def.xp >= 5 ? this.rng.chance(0.05) : this.rng.chance(0.004)) {
      this.dropPickup('repair', e.x, e.z, 0.12);
    }
    if (e === this.boss) {
      this.bossKilled = true;
      this.boss = null;
      this.events.push({ type: 'announce', text: 'Enemy flagship destroyed!' });
    }
  }

  private dropPickup(kind: PickupKind, x: number, z: number, value: number) {
    if (kind === 'xp') {
      let n = 0;
      for (const p of this.pickups) if (p.kind === 'xp') n++;
      if (n >= MAX_SHARDS) {
        // Merge into an existing shard instead of spawning more (SPEC §7.2).
        const xp = this.pickups.filter((p) => p.kind === 'xp' && !p.pulled);
        if (xp.length) {
          this.rng.pick(xp).value += value;
          return;
        }
      }
    }
    const p = this.pickupPool.pop() ?? ({} as Pickup);
    p.kind = kind;
    p.x = p.px = x;
    p.z = p.pz = z;
    p.value = value;
    p.pulled = false;
    p.speed = 0;
    p.alive = true;
    this.pickups.push(p);
  }

  // ---------- enemies ----------
  private stepEnemies() {
    const p = this.player;
    const circles = this.playerCircles([]);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.px = e.x;
      e.pz = e.z;
      e.flash = Math.max(0, e.flash - DT);
      e.contactCd -= DT;
      e.fireCd -= DT;
      e.spawnCd -= DT;
      e.peel -= DT;
      const dx = p.x + e.ox - e.x, dz = p.z + e.oz - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      const toP = Math.atan2(dx, dz);
      let want = toP;
      let speed = e.def.speed;
      const range = e.def.range ?? 0;
      if (e.peel > 0) {
        want = Math.atan2(e.wingX, e.wingZ);
        speed *= 1.15;
      } else if (e.wingTime > 0 && dist > 220) {
        e.wingTime -= DT;
        want = Math.atan2(e.wingX, e.wingZ);
      } else {
        e.wingTime = 0;
        switch (e.def.behaviour) {
          case 'chase':
          case 'kamikaze':
            break;
          case 'shooter':
          case 'gunship':
          case 'bomber':
          case 'carrier':
          case 'boss': {
            const keep = range * (e.def.behaviour === 'shooter' ? 0.85 : 0.75);
            if (dist < keep * 0.6) want = toP + Math.PI; // back off
            else if (dist < keep * 1.15) {
              want = toP + (Math.PI / 2) * e.orbitDir * (dist < keep ? 1.15 : 0.8);
              speed *= e.def.behaviour === 'boss' ? 0.6 : 0.8;
            }
            if (e.fireCd <= 0 && dist < range * 1.25) this.enemyFire(e, dist);
            break;
          }
        }
      }
      e.heading = turnToward(e.heading, want, e.def.turn * DT);
      e.x += (Math.sin(e.heading) * speed + e.kvx) * DT;
      e.z += (Math.cos(e.heading) * speed + e.kvz) * DT;
      const kd = Math.pow(0.04, DT);
      e.kvx *= kd;
      e.kvz *= kd;

      // Separation from other enemies so wings don't collapse into one blob.
      for (const o of this.grid.query(e.x, e.z, e.radius + 30, this.tmp)) {
        if (o === e || !o.alive) continue;
        const sx = e.x - o.x, sz = e.z - o.z;
        const min = e.radius + o.radius;
        const d2 = sx * sx + sz * sz;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * (o.radius / (e.radius + o.radius)) * 0.5;
          e.x += sx * push;
          e.z += sz * push;
        }
      }

      // Contact with the player's hull.
      for (const c of circles) {
        const cx = e.x - c.x, cz = e.z - c.z;
        const min = e.radius + PLAYER_BASE.circleRadius;
        const d2 = cx * cx + cz * cz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1;
        if (e.def.behaviour === 'kamikaze') {
          this.damagePlayer(e.def.contactDmg * e.dmgMult, 'kamikaze');
          e.hp = 0;
          this.killEnemy(e);
          break;
        }
        e.x = c.x + (cx / d) * min;
        e.z = c.z + (cz / d) * min;
        if (e.isBoss) {
          p.x -= (cx / d) * 0.6;
          p.z -= (cz / d) * 0.6;
        }
        if (e.contactCd <= 0) {
          this.damagePlayer(e.def.contactDmg * e.dmgMult, 'ramming');
          e.contactCd = 1.2;
          if (e.radius < 15) {
            const away = Math.atan2(cx, cz) + this.rng.range(-0.7, 0.7);
            e.wingX = Math.sin(away);
            e.wingZ = Math.cos(away);
            e.peel = this.rng.range(1.2, 2.2);
            e.wingTime = 0;
          }
        }
      }

      if (!e.isBoss && dist > DESPAWN_DIST) this.relocate(e);
    }
  }

  private enemyFire(e: Enemy, dist: number) {
    const p = this.player;
    const def = e.def;
    e.fireCd = (def.fireCd ?? 2) * this.rng.range(0.85, 1.15);
    const dmg = (def.projDmg ?? 5) * e.dmgMult;
    const fwdX = Math.sin(e.heading), fwdZ = Math.cos(e.heading);
    const mx = e.x + fwdX * e.radius, mz = e.z + fwdZ * e.radius;
    const lead = leadTarget(mx, mz, { x: p.x, z: p.z, px: p.px, pz: p.pz } as Enemy, def.projSpeed || 150);
    const aim = Math.atan2(lead.x - mx, lead.z - mz);
    switch (def.behaviour) {
      case 'shooter':
        this.spawnEnemyBolt(mx, mz, aim + this.rng.range(-0.06, 0.06), def.projSpeed!, dmg, dist);
        break;
      case 'gunship': {
        const n = def.id === 'pancake' ? 4 : 3;
        for (let i = 0; i < n; i++) this.spawnEnemyBolt(mx, mz, aim + (i - (n - 1) / 2) * 0.12, def.projSpeed!, dmg, dist);
        break;
      }
      case 'bomber': {
        const pr = this.spawnProj('emissile', mx, mz, aim + this.rng.range(-0.5, 0.5), def.projSpeed!, dmg, 6, 4, 0, null);
        pr.hp = 1;
        break;
      }
      case 'carrier':
        this.launchFighters(e, 3);
        break;
      case 'boss': {
        const n = e.def.id === 'boss' ? 9 : 6;
        for (let i = 0; i < n; i++) this.spawnEnemyBolt(e.x, e.z, aim + (i - (n - 1) / 2) * 0.14, def.projSpeed!, dmg, dist);
        if (e.spawnCd <= 0) {
          this.launchFighters(e, e.def.id === 'boss' ? 5 : 3);
          if (e.def.id === 'boss') {
            for (let i = 0; i < 2; i++) this.spawnProj('emissile', e.x, e.z, aim + (i ? 0.8 : -0.8), 120, dmg * 2, 7, 4, 0, null);
          }
          e.spawnCd = 9;
        }
        break;
      }
      default:
        break;
    }
    if (this.rng.chance(0.25)) this.events.push({ type: 'sound', id: 'laser_retro_001', vol: 0.08 });
  }

  private spawnEnemyBolt(x: number, z: number, a: number, speed: number, dmg: number, dist: number) {
    this.spawnProj('ebolt', x, z, a, speed, dmg, Math.max(2.5, (dist / speed) * 1.6), 3, 0, null);
  }

  private launchFighters(e: Enemy, n: number) {
    if (this.enemies.length >= MAX_ENEMIES) return;
    for (let i = 0; i < n; i++) {
      const f = this.spawnEnemy(ENEMIES.striker, e.x + this.rng.range(-e.radius, e.radius), e.z + this.rng.range(-e.radius, e.radius));
      f.heading = e.heading + this.rng.range(-1, 1);
    }
  }

  private relocate(e: Enemy) {
    const p = this.player;
    const moveA = Math.hypot(p.vx, p.vz) > 5 ? Math.atan2(p.vx, p.vz) : this.rng.range(0, Math.PI * 2);
    const a = moveA + this.rng.range(-1, 1);
    e.x = e.px = p.x + Math.sin(a) * SPAWN_DIST;
    e.z = e.pz = p.z + Math.cos(a) * SPAWN_DIST;
    e.heading = a + Math.PI;
    e.wingTime = 0;
  }

  spawnEnemy(def: EnemyDef, x: number, z: number, boss = false): Enemy {
    const e = this.enemyPool.pop() ?? ({} as Enemy);
    const hpMult = this.enemyHpMult;
    e.uid = this.uid++;
    e.def = def;
    e.x = e.px = x;
    e.z = e.pz = z;
    e.heading = Math.atan2(this.player.x - x, this.player.z - z);
    e.kvx = e.kvz = 0;
    e.maxHp = e.hp = def.hp * hpMult;
    e.radius = def.radius;
    e.scale = def.scale;
    e.alive = true;
    e.fireCd = (def.fireCd ?? 2) * this.rng.range(0.5, 1.2);
    e.spawnCd = 5;
    e.wingTime = 0;
    e.wingX = e.wingZ = 0;
    e.orbitDir = this.rng.chance(0.5) ? 1 : -1;
    const oa = this.rng.range(0, Math.PI * 2), or = def.radius > 12 ? 0 : this.rng.range(0, 28);
    e.ox = Math.sin(oa) * or;
    e.oz = Math.cos(oa) * or;
    e.contactCd = 0;
    e.peel = 0;
    e.dmgMult = 1;
    e.isBoss = boss;
    e.flash = 0;
    e.view = undefined;
    this.enemies.push(e);
    return e;
  }

  // ---------- projectiles ----------
  private stepProjectiles() {
    const p = this.player;
    const circles = this.playerCircles([]);
    for (const pr of this.projectiles) {
      if (!pr.alive) continue;
      pr.px = pr.x;
      pr.pz = pr.z;
      pr.life -= DT;
      if (pr.kind === 'missile') {
        if (!pr.target || !pr.target.alive) pr.target = this.nearestEnemy(pr.x, pr.z, 400);
        pr.speed = Math.min(pr.speed + 420 * DT, 420);
        let a = Math.atan2(pr.vx, pr.vz);
        if (pr.target) a = turnToward(a, Math.atan2(pr.target.x - pr.x, pr.target.z - pr.z), 4.5 * DT);
        pr.vx = Math.sin(a) * pr.speed;
        pr.vz = Math.cos(a) * pr.speed;
      } else if (pr.kind === 'emissile') {
        pr.speed = Math.min(pr.speed + 30 * DT, 190);
        let a = Math.atan2(pr.vx, pr.vz);
        a = turnToward(a, Math.atan2(p.x - pr.x, p.z - pr.z), 1.3 * DT);
        pr.vx = Math.sin(a) * pr.speed;
        pr.vz = Math.cos(a) * pr.speed;
      }
      pr.x += pr.vx * DT;
      pr.z += pr.vz * DT;

      if (pr.kind === 'flak') {
        if (pr.life <= 0) {
          this.aoeDamage(pr.tx, pr.tz, pr.aoe, pr.dmg);
          this.events.push({ type: 'sound', id: 'explosion_crunch_002', vol: 0.15 });
          pr.alive = false;
        }
        continue;
      }
      if (pr.life <= 0) {
        pr.alive = false;
        continue;
      }
      if (pr.kind === 'ebolt' || pr.kind === 'emissile') {
        for (const c of circles) {
          if ((pr.x - c.x) ** 2 + (pr.z - c.z) ** 2 < (PLAYER_BASE.circleRadius + pr.radius) ** 2) {
            this.damagePlayer(pr.dmg, pr.kind === 'emissile' ? 'missiles' : 'gunfire');
            this.events.push({ type: pr.kind === 'emissile' ? 'explosion' : 'hit', x: pr.x, z: pr.z, enemy: false, size: 2 } as GameEvent);
            pr.alive = false;
            break;
          }
        }
        continue;
      }
      // Player projectiles: point defense also kills enemy missiles.
      if (pr.kind === 'pd') {
        for (const em of this.projectiles) {
          if (em.alive && em.kind === 'emissile' && (em.x - pr.x) ** 2 + (em.z - pr.z) ** 2 < 64) {
            em.alive = false;
            pr.alive = false;
            this.events.push({ type: 'explosion', x: em.x, z: em.z, size: 1.2 });
            break;
          }
        }
        if (!pr.alive) continue;
      }
      for (const e of this.grid.query(pr.x, pr.z, pr.radius + 30, this.tmp)) {
        if (!e.alive) continue;
        const r = e.radius + pr.radius;
        if ((e.x - pr.x) ** 2 + (e.z - pr.z) ** 2 < r * r) {
          if (pr.kind === 'missile') {
            this.aoeDamage(pr.x, pr.z, pr.aoe, pr.dmg);
            this.events.push({ type: 'sound', id: 'explosion_crunch_000', vol: 0.12 });
          } else this.damageEnemy(e, pr.dmg);
          pr.alive = false;
          break;
        }
      }
    }
  }

  // ---------- pickups ----------
  private stepPickups() {
    const p = this.player;
    const mr = this.magnetRange;
    for (const k of this.pickups) {
      if (!k.alive) continue;
      k.px = k.x;
      k.pz = k.z;
      const dx = p.x - k.x, dz = p.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (!k.pulled && d < mr + 30) k.pulled = true;
      if (k.pulled) {
        k.speed = Math.min(k.speed + 500 * DT, 520);
        k.x += (dx / d) * k.speed * DT;
        k.z += (dz / d) * k.speed * DT;
      }
      if (d < 26) {
        k.alive = false;
        this.collect(k);
      }
    }
  }

  private collect(k: Pickup) {
    const p = this.player;
    if (k.kind === 'xp') {
      p.xp += k.value;
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = xpForLevel(p.level);
        this.pendingLevelUps++;
        this.events.push({ type: 'levelup' });
      }
      if (this.rng.chance(0.15)) this.events.push({ type: 'sound', id: 'computer_noise_000', vol: 0.04 });
    } else if (k.kind === 'repair') {
      p.hull = Math.min(p.maxHull, p.hull + p.maxHull * k.value);
      this.events.push({ type: 'sound', id: 'door_open_000', vol: 0.5 });
      this.events.push({ type: 'announce', text: 'Hull repaired' });
    } else {
      for (const o of this.pickups) if (o.alive && o.kind === 'xp') o.pulled = true;
      this.events.push({ type: 'sound', id: 'force_field_002', vol: 0.5 });
    }
  }

  // ---------- spawning (wave director) ----------
  private stepDirector() {
    const m = this.minutes;
    const alive = this.enemies.length;
    const endless = Math.max(0, this.t - this.duration) / 60;

    // Wings arrive in formation from off-screen: 12 ships read as one fleet (SPEC §3.5).
    this.wingTimer -= DT;
    if (this.wingTimer <= 0 && alive < MAX_ENEMIES - 6) {
      this.wingTimer = Math.max(2.4, 7.5 - m * 0.55 - endless * 0.3) * this.rng.range(0.8, 1.2);
      const heavyChance = m < 1.5 ? 0 : Math.min(0.45, 0.12 + (m - 1.5) * 0.05);
      if (this.rng.chance(heavyChance)) {
        const pool = ['challenger', 'executioner', 'bob'];
        this.spawnWing(ENEMIES[this.rng.pick(pool)], Math.min(6, 2 + Math.floor(m / 3)), 'line');
      } else {
        const pool: string[] = ['striker', 'striker'];
        if (m > 0.5) pool.push('dispatcher');
        if (m > 1) pool.push('insurgent');
        if (m > 1.75) pool.push('spitfire');
        if (m > 3) pool.push('zenith');
        const def = ENEMIES[this.rng.pick(pool)];
        const size = Math.min(16, 5 + Math.floor(m * 1.2 + endless * 2));
        this.spawnWing(def, size, this.rng.chance(0.6) ? 'v' : 'line');
      }
    }

    // Keep a minimum presence so the screen never goes quiet.
    this.trickleTimer -= DT;
    const minAlive = Math.min(70, 6 + m * 5 + endless * 10);
    if (this.trickleTimer <= 0 && alive < minAlive) {
      this.trickleTimer = 0.35;
      const def = m > 2 && this.rng.chance(0.3) ? ENEMIES.spitfire : this.rng.chance(0.5) ? ENEMIES.striker : ENEMIES.dispatcher;
      const a = this.rng.range(0, Math.PI * 2);
      this.spawnEnemy(def, this.player.x + Math.sin(a) * SPAWN_DIST, this.player.z + Math.cos(a) * SPAWN_DIST);
    }

    // Frigates (carriers / heavy gunships) from minute 2.5.
    this.frigateTimer -= DT;
    if (this.frigateTimer <= 0 && alive < MAX_ENEMIES - 4) {
      this.frigateTimer = Math.max(22, 50 - m * 2.5 - endless * 3);
      const def = this.rng.chance(0.5) ? ENEMIES.omen : ENEMIES.pancake;
      this.spawnWing(def, m > 7 ? 2 : 1, 'line');
      this.events.push({ type: 'announce', text: 'Enemy frigate inbound' });
    }

    if (this.miniBossTimes.length && this.t >= this.miniBossTimes[0]) {
      this.miniBossTimes.shift();
      this.spawnBig(ENEMIES.elite, 'Elite battle group inbound!');
    }
    if (!this.bossSpawned && this.t >= this.bossTime) {
      this.bossSpawned = true;
      this.boss = this.spawnBig(ENEMIES.boss, 'Enemy flagship has arrived!');
    }
  }

  private spawnBig(def: EnemyDef, text: string): Enemy {
    const a = this.rng.range(0, Math.PI * 2);
    const e = this.spawnEnemy(def, this.player.x + Math.sin(a) * (SPAWN_DIST + 80), this.player.z + Math.cos(a) * (SPAWN_DIST + 80), true);
    this.events.push({ type: 'announce', text });
    this.events.push({ type: 'sound', id: 'space_engine_large_000', vol: 0.8 });
    // Escort wing
    this.spawnWing(ENEMIES.dispatcher, 8, 'v', a);
    return e;
  }

  private spawnWing(def: EnemyDef, size: number, shape: 'v' | 'line', angle?: number) {
    const p = this.player;
    const a = angle ?? this.rng.range(0, Math.PI * 2);
    const cx = p.x + Math.sin(a) * SPAWN_DIST, cz = p.z + Math.cos(a) * SPAWN_DIST;
    const head = a + Math.PI + this.rng.range(-0.25, 0.25);
    const fx = Math.sin(head), fz = Math.cos(head); // forward
    const rx = fz, rz = -fx; // right
    const gap = def.radius * 2.6 + 4;
    for (let i = 0; i < size && this.enemies.length < MAX_ENEMIES; i++) {
      let lat: number, back: number;
      if (shape === 'v') {
        const k = Math.ceil(i / 2);
        lat = (i % 2 ? 1 : -1) * k * gap;
        back = k * gap * 0.9;
      } else {
        const perRow = Math.min(size, 6);
        lat = ((i % perRow) - (perRow - 1) / 2) * gap;
        back = Math.floor(i / perRow) * gap;
      }
      const e = this.spawnEnemy(def, cx + rx * lat - fx * back, cz + rz * lat - fz * back);
      e.heading = head;
      e.wingTime = 6;
      e.wingX = fx;
      e.wingZ = fz;
    }
  }

  private compact() {
    compactInto(this.enemies, this.enemyPool);
    compactInto(this.projectiles, this.projPool);
    compactInto(this.pickups, this.pickupPool);
  }

  // ---------- level-up choices ----------
  rollChoices(n = 3): Choice[] {
    const p = this.player;
    const pool: { c: Choice; w: number }[] = [];
    for (const w of p.weapons) if (w.level < 5) pool.push({ c: { kind: 'weapon', id: w.id, level: w.level + 1 }, w: 3 });
    if (p.weapons.length < MAX_WEAPONS) {
      for (const id of Object.keys(WEAPONS) as WeaponId[]) {
        if (!p.weapons.some((w) => w.id === id)) pool.push({ c: { kind: 'weapon', id, level: 1 }, w: 2.2 });
      }
    }
    const ownedPassives = Object.keys(p.passives).length;
    for (const id of Object.keys(PASSIVES) as PassiveId[]) {
      const lvl = p.passives[id] ?? 0;
      if (lvl >= PASSIVES[id].max) continue;
      if (lvl === 0 && ownedPassives >= MAX_PASSIVES) continue;
      pool.push({ c: { kind: 'passive', id, level: lvl + 1 }, w: lvl ? 1.8 : 1.3 });
    }
    const out: Choice[] = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((a, b) => a + b.w, 0);
      let r = this.rng.next() * total;
      let idx = 0;
      for (; idx < pool.length - 1; idx++) {
        r -= pool[idx].w;
        if (r <= 0) break;
      }
      out.push(pool[idx].c);
      pool.splice(idx, 1);
    }
    if (out.length < n) out.push({ kind: 'heal' });
    if (out.length < n) out.push({ kind: 'credits' });
    return out;
  }

  applyChoice(c: Choice) {
    const p = this.player;
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    if (c.kind === 'weapon') {
      const w = p.weapons.find((x) => x.id === c.id);
      if (w) w.level = c.level;
      else p.weapons.push({ id: c.id, level: 1, cd: 0.3 });
      this.refreshTurrets();
    } else if (c.kind === 'passive') {
      p.passives[c.id] = c.level;
      if (c.id === 'hull') {
        const old = p.maxHull;
        p.maxHull = PLAYER_BASE.hull * (1 + 0.08 * this.meta.hull) * (1 + 0.2 * c.level);
        p.hull = Math.min(p.maxHull, p.hull + (p.maxHull - old) + p.maxHull * 0.2);
      }
    } else if (c.kind === 'heal') {
      p.hull = Math.min(p.maxHull, p.hull + p.maxHull * 0.3);
    } else {
      this.bonusCredits += 25;
    }
  }

  private refreshTurrets() {
    const p = this.player;
    const mounted = new Set<number>();
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      const n = w.id === 'pulse' ? def.levels[w.level - 1].count : def.hardpoints.length;
      def.hardpoints.slice(0, n).forEach((h) => mounted.add(h));
    }
    p.turretAim = p.turretAim.map((a, i) => (mounted.has(i) ? (Number.isNaN(a) ? p.heading : a) : NaN));
  }
}

// ---------- helpers ----------

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function turnToward(a: number, target: number, maxStep: number): number {
  const d = angleDiff(a, target);
  return a + Math.max(-maxStep, Math.min(maxStep, d));
}

function leadTarget(x: number, z: number, t: { x: number; z: number; px: number; pz: number }, speed: number) {
  const vx = (t.x - t.px) / DT, vz = (t.z - t.pz) / DT;
  const tt = Math.hypot(t.x - x, t.z - z) / speed;
  return { x: t.x + vx * tt, z: t.z + vz * tt };
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax, abz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

function shuffle<T>(arr: T[], rng: Rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function compactInto<T extends { alive: boolean }>(arr: T[], pool: T[]) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x.alive) arr[w++] = x;
    else pool.push(x);
  }
  arr.length = w;
}

/** Uniform spatial hash for broad-phase queries (SPEC §6.2). */
class Grid {
  private cells = new Map<number, Enemy[]>();
  private used: Enemy[][] = [];
  private spare: Enemy[][] = [];
  constructor(private size: number) {}
  private key(cx: number, cz: number) {
    return ((cx + 32768) << 16) | (cz + 32768);
  }
  clear() {
    for (const a of this.used) {
      a.length = 0;
      this.spare.push(a);
    }
    this.used.length = 0;
    this.cells.clear();
  }
  insert(e: Enemy) {
    const k = this.key(Math.floor(e.x / this.size), Math.floor(e.z / this.size));
    let a = this.cells.get(k);
    if (!a) {
      a = this.spare.pop() ?? [];
      this.cells.set(k, a);
      this.used.push(a);
    }
    a.push(e);
  }
  /** Returns candidates (not exact-distance filtered). `out` is reused. */
  query(x: number, z: number, r: number, out: Enemy[]): Enemy[] {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.size), x1 = Math.floor((x + r) / this.size);
    const z0 = Math.floor((z - r) / this.size), z1 = Math.floor((z + r) / this.size);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const a = this.cells.get(this.key(cx, cz));
        if (a) for (const e of a) out.push(e);
      }
    }
    return out;
  }
}
