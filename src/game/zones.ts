// Planet zone maps (SPEC §4): every planet is a flat tactical map split into zones. Each zone is held by a faction;
// any enemy zone that touches Alliance territory can be attacked (Andre, 2026-11-04). Generated deterministically
// from the planet's seed, so every player sees the same map and save files only need to store Control per zone id.
import { FactionId, PLANETS, PlanetDef, PlanetId } from './data';
import { Rng } from './rng';

export type Pt = [number, number];

export interface Zone {
  id: string;
  planet: PlanetId;
  name: string;
  /** Voronoi site, in map units (width MAP_W, height MAP_H). */
  x: number;
  y: number;
  /** Polygon centroid, used for labels. */
  cx: number;
  cy: number;
  poly: Pt[];
  neighbours: string[];
  /** Faction holding the zone at the start of the war. */
  owner: FactionId;
  /** Hops from the Alliance's starting territory (0 = Alliance-held at start). */
  depth: number;
  tier: number;
  /** A faction's capital: a fortress zone, one tier harder. */
  capital: boolean;
}

/** A border segment shared by two zones. */
export interface Edge {
  a: string;
  b: string;
  p: Pt;
  q: Pt;
}

export interface ZoneMap {
  planet: PlanetDef;
  zones: Zone[];
  edges: Edge[];
}

export const MAP_W = 1.4;
export const MAP_H = 1;

export function buildZoneMap(planet: PlanetDef): ZoneMap {
  const rng = new Rng(planet.seed);
  const { cols, rows } = planet.grid;
  // Jittered grid sites give evenly sized but irregular zones.
  const sites: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offset = r % 2 ? 0.5 : 0;
      const x = ((c + 0.5 + offset * 0.6 + rng.range(-0.32, 0.32)) / cols) * MAP_W;
      const y = ((r + 0.5 + rng.range(-0.32, 0.32)) / rows) * MAP_H;
      sites.push([Math.min(MAP_W - 0.02, Math.max(0.02, x)), Math.min(MAP_H - 0.02, Math.max(0.02, y))]);
    }
  }
  const n = sites.length;
  const polys = sites.map((_, i) => voronoiCell(sites, i));

  // Neighbours: two cells share a border edge of useful length.
  const nb: number[][] = sites.map(() => []);
  const edges: { a: number; b: number; p: Pt; q: Pt }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const seg = sharedEdge(polys[i], sites[i], sites[j]);
      if (seg && dist(seg[0], seg[1]) > 0.012) {
        nb[i].push(j);
        nb[j].push(i);
        edges.push({ a: i, b: j, p: seg[0], q: seg[1] });
      }
    }
  }

  // Territory: each faction grows out from its capital; the Alliance holds only a small beachhead.
  const owner: (FactionId | null)[] = new Array(n).fill(null);
  const capital = new Array(n).fill(false);
  const nearest = (p: Pt) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (dist(sites[i], p) < dist(sites[best], p)) best = i;
    return best;
  };
  const starts: { f: FactionId; cell: number; weight: number }[] = [];
  starts.push({ f: 'alliance', cell: nearest(planet.alliance.at), weight: 1 });
  for (const f of planet.factions) starts.push({ f: f.id, cell: nearest(f.capital), weight: f.weight });
  const count: Partial<Record<FactionId, number>> = {};
  for (const s of starts) {
    owner[s.cell] = s.f;
    count[s.f] = 1;
    if (s.f !== 'alliance') capital[s.cell] = true;
  }
  let open = n - starts.length;
  while (open > 0) {
    // Pick a faction (weighted), then grow it into a random unclaimed neighbour.
    const growers = starts.filter((s) => (s.f !== 'alliance' || (count.alliance ?? 0) < planet.alliance.size) && frontier(s.f).length > 0);
    if (!growers.length) break;
    const total = growers.reduce((a, s) => a + s.weight, 0);
    let pick = rng.range(0, total);
    let g = growers[0];
    for (const s of growers) {
      pick -= s.weight;
      if (pick <= 0) { g = s; break; }
    }
    const f = frontier(g.f);
    const cell = f[Math.floor(rng.next() * f.length)];
    owner[cell] = g.f;
    count[g.f] = (count[g.f] ?? 0) + 1;
    open--;
  }
  function frontier(f: FactionId): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) if (owner[i] === null && nb[i].some((j) => owner[j] === f)) out.push(i);
    return out;
  }
  // Islands the growth could not reach (should not happen on a connected grid) go to the first enemy faction.
  for (let i = 0; i < n; i++) if (owner[i] === null) owner[i] = planet.factions[0].id;

  // Depth from Alliance territory drives difficulty: the deeper behind enemy lines, the higher the tier.
  const depth = new Array(n).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (owner[i] === 'alliance') { depth[i] = 0; queue.push(i); }
  while (queue.length) {
    const i = queue.shift()!;
    for (const j of nb[i]) if (depth[j] > depth[i] + 1) { depth[j] = depth[i] + 1; queue.push(j); }
  }

  const names = shuffled(planet.names, rng);
  const ids = sites.map((_, i) => `${planet.id}-${String(i).padStart(2, '0')}`);
  const zones: Zone[] = sites.map((s, i) => {
    const d = Number.isFinite(depth[i]) ? depth[i] : 9;
    const tier = owner[i] === 'alliance' ? 0 : Math.min(5, planet.baseTier + Math.floor((d - 1) / 2) + (capital[i] ? 1 : 0));
    const [cx, cy] = centroid(polys[i]);
    return {
      id: ids[i], planet: planet.id, name: names[i % names.length], x: s[0], y: s[1], cx, cy, poly: polys[i],
      neighbours: nb[i].map((j) => ids[j]), owner: owner[i]!, depth: d, tier, capital: capital[i],
    };
  });
  return { planet, zones, edges: edges.map((e) => ({ a: ids[e.a], b: ids[e.b], p: e.p, q: e.q })) };
}

/** The Voronoi cell of site i, clipped to the map rectangle (half-plane clipping, fine for ~40 sites). */
function voronoiCell(sites: Pt[], i: number): Pt[] {
  let poly: Pt[] = [[0, 0], [MAP_W, 0], [MAP_W, MAP_H], [0, MAP_H]];
  const [sx, sy] = sites[i];
  for (let j = 0; j < sites.length && poly.length; j++) {
    if (j === i) continue;
    const [tx, ty] = sites[j];
    // Keep points closer to i than to j: dot(p - m, t - s) <= 0, m = midpoint.
    const nx = tx - sx, ny = ty - sy;
    const mx = (sx + tx) / 2, my = (sy + ty) / 2;
    poly = clip(poly, (p) => (p[0] - mx) * nx + (p[1] - my) * ny);
  }
  return poly;
}

function clip(poly: Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Part of cell s's polygon that lies on the bisector between s and t, if any. */
function sharedEdge(poly: Pt[], s: Pt, t: Pt): [Pt, Pt] | null {
  const nx = t[0] - s[0], ny = t[1] - s[1];
  const len = Math.hypot(nx, ny);
  const mx = (s[0] + t[0]) / 2, my = (s[1] + t[1]) / 2;
  const on = poly.filter((p) => Math.abs(((p[0] - mx) * nx + (p[1] - my) * ny) / len) < 1e-7);
  if (on.length < 2) return null;
  let best: [Pt, Pt] = [on[0], on[1]];
  for (let a = 0; a < on.length; a++) for (let b = a + 1; b < on.length; b++) if (dist(on[a], on[b]) > dist(best[0], best[1])) best = [on[a], on[b]];
  return best;
}

function centroid(poly: Pt[]): Pt {
  let a = 0, x = 0, y = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length];
    const c = p[0] * q[1] - q[0] * p[1];
    a += c;
    x += (p[0] + q[0]) * c;
    y += (p[1] + q[1]) * c;
  }
  if (Math.abs(a) < 1e-12) return poly[0];
  return [x / (3 * a), y / (3 * a)];
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function shuffled<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const ZONE_MAPS: Record<PlanetId, ZoneMap> = Object.fromEntries(PLANETS.map((p) => [p.id, buildZoneMap(p)])) as Record<PlanetId, ZoneMap>;
export const ALL_ZONES: Zone[] = PLANETS.flatMap((p) => ZONE_MAPS[p.id].zones);
const BY_ID = new Map(ALL_ZONES.map((z) => [z.id, z]));

export function zoneById(id: string): Zone | undefined {
  return BY_ID.get(id);
}
