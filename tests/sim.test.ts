import { describe, expect, it } from 'vitest';
import { World, NO_META, DT } from '../src/game/world';
import { Rng } from '../src/game/rng';
import { computeRewards, migrate, newSave, buyMeta, isAttackable, holder } from '../src/game/save';
import { ZONE_MAPS, zoneById } from '../src/game/zones';
import { PLANETS } from '../src/game/data';

function simulate(seconds: number, seed = 1, tier = 1) {
  const w = new World({ seed, tier, duration: 480, meta: NO_META });
  const steps = Math.round(seconds / DT);
  let levelTimes: number[] = [];
  for (let i = 0; i < steps && !w.over; i++) {
    // Simple bot: fly to the nearest XP shard, otherwise circle like a kiting player.
    let mx = Math.sin(w.t * 0.25), mz = Math.cos(w.t * 0.25);
    let best = 350 * 350;
    for (const k of w.pickups) {
      const d = (k.x - w.player.x) ** 2 + (k.z - w.player.z) ** 2;
      if (d < best) { best = d; const l = Math.sqrt(d) || 1; mx = (k.x - w.player.x) / l; mz = (k.z - w.player.z) / l; }
    }
    w.step({ mx, mz, boost: false });
    while (w.pendingLevelUps > 0) {
      levelTimes.push(w.t);
      w.applyChoice(w.rollChoices()[0]);
    }
    w.events.length = 0;
  }
  return { w, levelTimes };
}

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });
});

describe('world', () => {
  it('runs a full mission without errors and stays in budget', () => {
    const { w, levelTimes } = simulate(480, 7);
    // eslint-disable-next-line no-console
    console.log(`t=${w.t.toFixed(0)} over=${w.over} hull=${w.player.hull.toFixed(0)} lvl=${w.player.level} kills=${w.kills} enemies=${w.enemies.length} proj=${w.projectiles.length} levelups@${levelTimes.slice(0, 12).map((t) => t.toFixed(0)).join(',')} weapons=${w.player.weapons.map((x) => x.id + x.level).join(' ')}`);
    expect(w.enemies.length).toBeLessThanOrEqual(150);
    expect(w.kills).toBeGreaterThan(50);
    expect(w.player.level).toBeGreaterThan(5);
  });

  it('is deterministic for the same seed and input', () => {
    const a = simulate(60, 3).w, b = simulate(60, 3).w;
    expect(a.kills).toBe(b.kills);
    expect(a.player.x).toBe(b.player.x);
  });

  it('offers three distinct level-up choices', () => {
    const w = new World({ seed: 1, tier: 1, duration: 480, meta: NO_META });
    const c = w.rollChoices();
    expect(c).toHaveLength(3);
    expect(new Set(c.map((x) => JSON.stringify(x))).size).toBe(3);
  });
});

describe('save and rewards', () => {
  it('migrates garbage into a valid save', () => {
    const s = migrate({ credits: -5, stats: { runs: 2 } });
    expect(s.credits).toBe(0);
    expect(s.stats.runs).toBe(2);
    expect(s.settings.volume).toBeGreaterThan(0);
  });
  it('losing still pays, winning pays more', () => {
    const base = { zoneId: 'megacity-00', tier: 1, bossKilled: false, duration: 480, endlessTime: 0, kills: 200, enemyCredits: 80 };
    const lose = computeRewards({ ...base, success: false, time: 200 }, 0);
    const win = computeRewards({ ...base, success: true, time: 480 }, 0);
    expect(lose.total).toBeGreaterThan(0);
    expect(win.total).toBeGreaterThan(lose.total);
    expect(win.controlGain).toBe(35);
  });
  it('buying meta upgrades costs credits', () => {
    const s = newSave();
    expect(buyMeta(s, 'm_hull')).toBe(false);
    s.credits = 1000;
    expect(buyMeta(s, 'm_hull')).toBe(true);
    expect(s.credits).toBe(940);
  });
  it('drops Control for zone ids that no longer exist', () => {
    const s = migrate({ version: 1, control: { mc_spire: 100, 'megacity-03': 40 } });
    expect(s.control).toEqual({ 'megacity-03': 40 });
  });
});

describe('zone maps', () => {
  it('every planet starts with several attackable zones, all bordering the Alliance', () => {
    const s = newSave();
    for (const p of PLANETS) {
      const zones = ZONE_MAPS[p.id].zones;
      const att = zones.filter((z) => isAttackable(s, z.id));
      expect(att.length).toBeGreaterThanOrEqual(3);
      for (const z of zones) {
        const borders = z.owner !== 'alliance' && z.neighbours.some((n) => zoneById(n)!.owner === 'alliance');
        expect(isAttackable(s, z.id)).toBe(borders);
      }
    }
  });
  it('neighbours are symmetric and every zone has an owner from the planet', () => {
    for (const p of PLANETS) {
      const owners = new Set(['alliance', ...p.factions.map((f) => f.id)]);
      for (const z of ZONE_MAPS[p.id].zones) {
        expect(owners.has(z.owner)).toBe(true);
        for (const n of z.neighbours) expect(zoneById(n)!.neighbours).toContain(z.id);
      }
    }
  });
  it('capturing a zone pushes the front line to its neighbours', () => {
    const s = newSave();
    const z = ZONE_MAPS.ocean.zones.find((x) => isAttackable(s, x.id))!;
    const behind = z.neighbours.filter((n) => !isAttackable(s, n) && holder(s, n) !== 'alliance');
    s.control[z.id] = 100;
    expect(holder(s, z.id)).toBe('alliance');
    expect(isAttackable(s, z.id)).toBe(false);
    for (const n of behind) expect(isAttackable(s, n)).toBe(true);
  });
});
