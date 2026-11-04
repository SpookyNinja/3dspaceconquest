import { META, MetaId, CONTROL, FactionId } from './data';
import { zoneById } from './zones';

export const SAVE_VERSION = 2;
const KEY = 'spaceconquest.save';

export interface SaveData {
  version: number;
  credits: number;
  meta: Partial<Record<MetaId, number>>;
  /** Alliance Control per zone, 0..100. 100 = captured. */
  control: Record<string, number>;
  stats: { runs: number; wins: number; kills: number; bestTime: number };
  settings: { volume: number; shake: boolean };
  lastPlayed: number;
}

export function newSave(): SaveData {
  return {
    version: SAVE_VERSION,
    credits: 0,
    meta: {},
    control: {},
    stats: { runs: 0, wins: 0, kills: 0, bestTime: 0 },
    settings: { volume: 0.7, shake: true },
    lastPlayed: Date.now(),
  };
}

/** Upgrades older saves to the current schema. Add a case per version bump. */
export function migrate(raw: unknown): SaveData {
  const base = newSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const out: SaveData = {
    ...base,
    ...r,
    meta: { ...(r.meta ?? {}) },
    control: { ...(r.control ?? {}) },
    stats: { ...base.stats, ...(r.stats ?? {}) },
    settings: { ...base.settings, ...(r.settings ?? {}) },
    version: SAVE_VERSION,
  };
  if (!Number.isFinite(out.credits) || out.credits < 0) out.credits = 0;
  // v1 had three hand-placed zones per planet; v2 zone maps use new ids, so old Control entries are dropped.
  for (const id of Object.keys(out.control)) if (!zoneById(id)) delete out.control[id];
  return out;
}

export function loadSave(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SaveData {
  try {
    const txt = storage?.getItem(KEY);
    return txt ? migrate(JSON.parse(txt)) : newSave();
  } catch {
    return newSave();
  }
}

export function writeSave(s: SaveData, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  s.lastPlayed = Date.now();
  try {
    storage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the game keeps running without saving */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function metaLevel(s: SaveData, id: MetaId): number {
  return s.meta[id] ?? 0;
}

export function buyMeta(s: SaveData, id: MetaId): boolean {
  const lvl = metaLevel(s, id);
  const def = META[id];
  if (lvl >= def.max) return false;
  const cost = def.cost(lvl);
  if (s.credits < cost) return false;
  s.credits -= cost;
  s.meta[id] = lvl + 1;
  return true;
}

export function isCaptured(s: SaveData, zoneId: string): boolean {
  return (s.control[zoneId] ?? 0) >= 100;
}

/** Who holds a zone right now: the Alliance once captured, otherwise its starting owner. */
export function holder(s: SaveData, zoneId: string): FactionId {
  const z = zoneById(zoneId);
  if (!z) return 'alliance';
  return z.owner === 'alliance' || isCaptured(s, zoneId) ? 'alliance' : z.owner;
}

/** Any enemy zone that borders Alliance territory can be attacked (SPEC §4.2, Andre 2026-11-04). */
export function isAttackable(s: SaveData, zoneId: string): boolean {
  const z = zoneById(zoneId);
  if (!z || holder(s, zoneId) === 'alliance') return false;
  return z.neighbours.some((n) => holder(s, n) === 'alliance');
}

export interface RunOutcome {
  zoneId: string;
  tier: number;
  success: boolean;
  bossKilled: boolean;
  time: number;
  duration: number;
  endlessTime: number;
  kills: number;
  enemyCredits: number;
}

export interface CreditBreakdown {
  lines: { label: string; amount: number }[];
  total: number;
  controlGain: number;
}

/** Credits = f(time survived, kills, win bonus, zone tier) (SPEC §3.6). Losing still pays. */
export function computeRewards(o: RunOutcome, salvageLevel: number): CreditBreakdown {
  const tierMult = 1 + (o.tier - 1) * 0.35;
  const lines: { label: string; amount: number }[] = [];
  const surv = Math.min(o.time, o.duration);
  lines.push({ label: `Time survived (${fmtTime(surv)})`, amount: Math.round((surv / 6) * tierMult) });
  lines.push({ label: `Kills (${o.kills})`, amount: Math.round(o.enemyCredits * tierMult) });
  if (o.success) lines.push({ label: 'Mission success', amount: Math.round(120 * tierMult) });
  if (o.bossKilled) lines.push({ label: 'Boss destroyed', amount: Math.round(150 * tierMult) });
  if (o.endlessTime > 0) lines.push({ label: `Endless mode (${fmtTime(o.endlessTime)})`, amount: Math.round((o.endlessTime / 60) * 45 * tierMult) });
  let total = lines.reduce((a, l) => a + l.amount, 0);
  if (salvageLevel > 0) {
    const bonus = Math.round(total * 0.08 * salvageLevel);
    lines.push({ label: `War Bonds +${salvageLevel * 8}%`, amount: bonus });
    total += bonus;
  }
  const controlGain = o.success
    ? CONTROL.win + (o.bossKilled ? CONTROL.bossBonus : 0)
    : Math.round(CONTROL.lossMax * Math.min(1, o.time / o.duration));
  return { lines, total, controlGain };
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
