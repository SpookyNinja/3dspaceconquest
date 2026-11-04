import { describe, expect, it } from 'vitest';
import { World, NO_META, DT } from '../src/game/world';
import { Rng } from '../src/game/rng';
import { computeRewards, migrate, newSave, buyMeta, isAttackable } from '../src/game/save';

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
    const base = { zoneId: 'mc_spire', tier: 1, bossKilled: false, duration: 480, endlessTime: 0, kills: 200, enemyCredits: 80 };
    const lose = computeRewards({ ...base, success: false, time: 200 }, 0);
    const win = computeRewards({ ...base, success: true, time: 480 }, 0);
    expect(lose.total).toBeGreaterThan(0);
    expect(win.total).toBeGreaterThan(lose.total);
    expect(win.controlGain).toBe(35);
  });
  it('buying meta upgrades costs credits and front line gates zones', () => {
    const s = newSave();
    expect(buyMeta(s, 'm_hull')).toBe(false);
    s.credits = 1000;
    expect(buyMeta(s, 'm_hull')).toBe(true);
    expect(s.credits).toBe(940);
    expect(isAttackable(s, 'mc_spire')).toBe(true);
    expect(isAttackable(s, 'mc_docks')).toBe(false);
    s.control.mc_spire = 100;
    expect(isAttackable(s, 'mc_docks')).toBe(true);
    expect(isAttackable(s, 'oc_shallows')).toBe(true);
  });
});
