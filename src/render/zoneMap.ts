// Flat tactical zone map of one planet (SPEC §4.1): zones tinted by the faction holding them, glowing faction borders,
// emblems, tug-of-war Control bars and attack arrows on every zone the Alliance can strike. Drawn on a 2D canvas
// in a sci-fi take on Andre's reference (docs/reference/zone-map-reference.webp).
import { FACTIONS, FactionId, PlanetId } from '../game/data';
import { MAP_H, MAP_W, Pt, ZONE_MAPS, Zone, pointInPoly, zoneById } from '../game/zones';
import { ASSET_BASE } from './common';

export interface ZoneView {
  holder: FactionId;
  attackable: boolean;
  control: number;
}

const rgba = (c: [number, number, number], a: number, k = 1) =>
  `rgba(${Math.round(Math.min(1, c[0] * k) * 255)},${Math.round(Math.min(1, c[1] * k) * 255)},${Math.round(Math.min(1, c[2] * k) * 255)},${a})`;
const ATTACK: [number, number, number] = [1, 0.55, 0.15];

export class ZoneMapView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  planet: PlanetId = 'megacity';
  selected: string | null = null;
  private hover: string | null = null;
  private states: Record<string, ZoneView> = {};
  private bg = new Map<PlanetId, HTMLImageElement>();
  private t = 0;
  private zoom = { k: 1, x: 0, y: 0 };
  private zooming: { start: number; dur: number; zone: Zone; res: () => void } | null = null;
  onPick: (zoneId: string) => void = () => {};
  /** Screen-space margins kept clear for the side panels. */
  margins = { left: 16, right: 16, top: 16, bottom: 16 };

  constructor(parent: HTMLElement) {
    const c = (this.canvas = document.createElement('canvas'));
    c.className = 'zonemap';
    parent.prepend(c);
    this.ctx = c.getContext('2d')!;
    for (const id of ['megacity', 'ocean'] as PlanetId[]) {
      const img = new Image();
      img.src = `${ASSET_BASE}textures/planets/${id}_albedo.jpg`;
      this.bg.set(id, img);
    }
    c.addEventListener('pointermove', (e) => {
      const z = this.zoneAt(e.offsetX, e.offsetY);
      this.hover = z?.id ?? null;
      c.style.cursor = z && this.states[z.id]?.attackable ? 'pointer' : z ? 'help' : 'default';
    });
    c.addEventListener('pointerleave', () => (this.hover = null));
    c.addEventListener('click', (e) => {
      if (this.zooming) return;
      const z = this.zoneAt(e.offsetX, e.offsetY);
      if (z) this.onPick(z.id);
    });
  }

  setStates(states: Record<string, ZoneView>) {
    this.states = states;
  }

  show(planet: PlanetId) {
    this.planet = planet;
    this.zoom = { k: 1, x: 0, y: 0 };
    this.zooming = null;
  }

  /** Map rectangle on screen (CSS pixels). */
  private rect() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const m = this.margins;
    const aw = Math.max(200, w - m.left - m.right), ah = Math.max(150, h - m.top - m.bottom);
    const s = Math.min(aw / MAP_W, ah / MAP_H);
    return { x: m.left + (aw - s * MAP_W) / 2, y: m.top + (ah - s * MAP_H) / 2, s };
  }

  private toScreen(p: Pt | [number, number], r = this.rect()): [number, number] {
    const x = r.x + p[0] * r.s, y = r.y + p[1] * r.s;
    const z = this.zoom;
    return [z.x + (x - z.x) * z.k, z.y + (y - z.y) * z.k];
  }

  private zoneAt(sx: number, sy: number): Zone | null {
    const r = this.rect();
    const z = this.zoom;
    const x = z.x + (sx - z.x) / z.k, y = z.y + (sy - z.y) / z.k;
    const p: Pt = [(x - r.x) / r.s, (y - r.y) / r.s];
    return ZONE_MAPS[this.planet].zones.find((zn) => pointInPoly(p, zn.poly)) ?? null;
  }

  /** Zoom into a zone before cutting to the mission; resolves when the screen should fade. */
  zoomInto(zoneId: string): Promise<void> {
    const zone = zoneById(zoneId);
    if (!zone) return Promise.resolve();
    return new Promise((res) => (this.zooming = { start: this.t, dur: 1.2, zone, res }));
  }

  render(dt: number) {
    this.t += dt;
    const c = this.canvas, ctx = this.ctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = this.rect();
    if (this.zooming) {
      const zz = this.zooming;
      const f = Math.min(1, (this.t - zz.start) / zz.dur);
      const e = f * f * (3 - 2 * f);
      const [cx, cy] = [r.x + zz.zone.cx * r.s, r.y + zz.zone.cy * r.s];
      this.zoom = { k: 1 + e * 5, x: cx, y: cy };
      if (f >= 1) {
        this.zooming = null;
        zz.res();
      }
    }
    const map = ZONE_MAPS[this.planet];

    // Backdrop: deep space with a faint grid.
    ctx.fillStyle = '#02050b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(70,120,200,0.06)';
    ctx.lineWidth = 1;
    for (let x = (this.t * 4) % 40; x < w; x += 40) line(ctx, x, 0, x, h);
    for (let y = 0; y < h; y += 40) line(ctx, 0, y, w, y);

    const [x0, y0] = this.toScreen([0, 0], r);
    const [x1, y1] = this.toScreen([MAP_W, MAP_H], r);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    // The planet's own surface, darkened, so the map reads as "this world".
    const img = this.bg.get(this.planet);
    if (img?.complete && img.naturalWidth) {
      ctx.globalAlpha = 0.55;
      const sw = img.naturalWidth * 0.62, sh = sw / MAP_W;
      ctx.drawImage(img, img.naturalWidth * 0.19, (img.naturalHeight - sh) / 2, sw, sh, x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(3,8,20,0.55)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // Zone fills.
    for (const z of map.zones) {
      const st = this.states[z.id];
      const col = FACTIONS[st?.holder ?? z.owner].color;
      const sel = z.id === this.selected, hov = z.id === this.hover;
      path(ctx, z.poly.map((p) => this.toScreen(p, r)));
      ctx.fillStyle = rgba(col, sel ? 0.55 : hov ? 0.46 : 0.32);
      ctx.fill();
      if (st?.attackable) {
        ctx.fillStyle = rgba(ATTACK, 0.06 + 0.05 * Math.sin(this.t * 3 + z.x * 9));
        ctx.fill();
      }
    }
    // Borders: thin inside a faction's territory, glowing where two factions meet.
    ctx.lineCap = 'round';
    for (const e of map.edges) {
      const ha = this.states[e.a]?.holder ?? zoneById(e.a)!.owner, hb = this.states[e.b]?.holder ?? zoneById(e.b)!.owner;
      const [px, py] = this.toScreen(e.p, r), [qx, qy] = this.toScreen(e.q, r);
      if (ha === hb) {
        ctx.strokeStyle = rgba(FACTIONS[ha].color, 0.35, 1.4);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        line(ctx, px, py, qx, qy);
        ctx.setLineDash([]);
      } else {
        const front = ha === 'alliance' || hb === 'alliance';
        ctx.shadowBlur = front ? 14 : 8;
        ctx.shadowColor = front ? rgba(ATTACK, 0.9) : 'rgba(255,255,255,0.5)';
        ctx.strokeStyle = front ? rgba(ATTACK, 0.95, 1.1) : 'rgba(230,236,255,0.75)';
        ctx.lineWidth = front ? 2.6 : 2;
        line(ctx, px, py, qx, qy);
        ctx.shadowBlur = 0;
      }
    }
    // Selected zone outline.
    const selZone = this.selected ? zoneById(this.selected) : null;
    if (selZone && selZone.planet === this.planet) {
      path(ctx, selZone.poly.map((p) => this.toScreen(p, r)));
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Attack arrows from the nearest Alliance zone into every attackable zone.
    for (const z of map.zones) {
      if (!this.states[z.id]?.attackable) continue;
      let from: Zone | null = null, best = Infinity;
      for (const n of z.neighbours) {
        const nz = zoneById(n)!;
        if (this.states[n]?.holder !== 'alliance') continue;
        const d = Math.hypot(nz.cx - z.cx, nz.cy - z.cy);
        if (d < best) { best = d; from = nz; }
      }
      if (from) this.arrow(this.toScreen([from.cx, from.cy], r), this.toScreen([z.cx, z.cy], r), z.id === this.selected);
    }

    // Labels: emblem, name, tier and Control.
    const fs = Math.max(8, Math.min(12, r.s * 0.021)) * Math.min(this.zoom.k, 1.6);
    for (const z of map.zones) {
      const st = this.states[z.id];
      const holder = st?.holder ?? z.owner;
      let [sx, sy] = this.toScreen([z.cx, z.cy], r);
      const em = fs * 1.15;
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      const half = ctx.measureText(z.name.toUpperCase()).width / 2 + 4;
      sx = Math.min(x1 - half, Math.max(x0 + half, sx)); // keep edge labels inside the frame
      sy = Math.min(y1 - fs * 2.6, Math.max(y0 + fs * 2.4, sy));
      emblem(ctx, holder, sx, sy - fs * 1.1, em, z.capital && holder !== 'alliance');
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const label = z.name.toUpperCase();
      ctx.fillText(label, sx + 1, sy + em * 0.25 + 1);
      ctx.fillStyle = holder === 'alliance' ? '#cfe4ff' : st?.attackable ? '#ffd9a8' : 'rgba(225,230,245,0.8)';
      ctx.fillText(label, sx, sy + em * 0.25);
      if (holder !== 'alliance') {
        ctx.font = `600 ${fs * 0.8}px system-ui, sans-serif`;
        ctx.fillStyle = st?.attackable ? 'rgba(255,190,110,0.95)' : 'rgba(170,180,210,0.6)';
        ctx.fillText(`${z.capital ? 'FORTRESS · ' : ''}TIER ${z.tier}`, sx, sy + em * 0.25 + fs * 1.2);
      }
      if (st && st.control > 0 && st.control < 100) {
        // Tug of war: Alliance blue pushing against the holder's colour.
        const bw = fs * 6, bh = 4, bx = sx - bw / 2, by = sy + em * 0.25 + fs * 2.3;
        ctx.fillStyle = rgba(FACTIONS[holder].color, 0.9);
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = rgba(FACTIONS.alliance.color, 1, 1.2);
        ctx.fillRect(bx, by, (bw * st.control) / 100, bh);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
      }
    }
    ctx.restore();

    // Frame with corner brackets and a scan line, so it reads as a tactical display.
    ctx.strokeStyle = 'rgba(90,169,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    ctx.strokeStyle = 'rgba(120,190,255,0.9)';
    ctx.lineWidth = 2;
    const b = 18;
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * b);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * b, cy);
      ctx.stroke();
    }
    const scan = y0 + (((this.t * 0.12) % 1) * (y1 - y0));
    const g = ctx.createLinearGradient(0, scan - 40, 0, scan);
    g.addColorStop(0, 'rgba(90,169,255,0)');
    g.addColorStop(1, 'rgba(90,169,255,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, Math.max(y0, scan - 40), x1 - x0, Math.min(40, scan - y0));
  }

  private arrow(a: [number, number], b: [number, number], strong: boolean) {
    const ctx = this.ctx;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 10) return;
    const ux = dx / len, uy = dy / len;
    const start = len * 0.18, end = len * 0.72;
    const step = 11;
    const offset = (this.t * 28) % step;
    ctx.strokeStyle = rgba(ATTACK, strong ? 1 : 0.8, strong ? 1.2 : 1);
    ctx.lineWidth = strong ? 3 : 2.2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = rgba(ATTACK, 0.8);
    for (let d = start + offset; d < end; d += step) {
      const cx = a[0] + ux * d, cy = a[1] + uy * d;
      ctx.beginPath();
      ctx.moveTo(cx - ux * 4 - uy * 4, cy - uy * 4 + ux * 4);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - ux * 4 + uy * 4, cy - uy * 4 - ux * 4);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function path(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Simple faction emblems: chevron (Alliance), cog (Concord), claws (Swarm), eye (Void). */
export function emblem(ctx: CanvasRenderingContext2D, f: FactionId, x: number, y: number, s: number, capital: boolean) {
  const col = FACTIONS[f].color;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  if (capital) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s * 1.05, Math.sin(a) * s * 1.05);
    }
    ctx.closePath();
  } else ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(4,8,18,0.85)';
  ctx.fill();
  ctx.lineWidth = capital ? 2 : 1.4;
  ctx.strokeStyle = rgba(col, 1, 1.25);
  ctx.stroke();
  ctx.strokeStyle = rgba(col, 1, 1.4);
  ctx.fillStyle = rgba(col, 1, 1.4);
  ctx.lineWidth = Math.max(1.2, s * 0.14);
  const k = s * 0.45;
  ctx.beginPath();
  if (f === 'alliance') {
    ctx.moveTo(-k, k * 0.2); ctx.lineTo(0, -k * 0.6); ctx.lineTo(k, k * 0.2);
    ctx.moveTo(-k, k * 0.8); ctx.lineTo(0, 0); ctx.lineTo(k, k * 0.8);
    ctx.stroke();
  } else if (f === 'concord') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * k * 0.6, Math.sin(a) * k * 0.6);
      ctx.lineTo(Math.cos(a) * k * 1.05, Math.sin(a) * k * 1.05);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, k * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  } else if (f === 'swarm') {
    for (const ox of [-0.55, 0, 0.55]) {
      ctx.moveTo(ox * k - k * 0.2, -k * 0.8);
      ctx.quadraticCurveTo(ox * k + k * 0.35, 0, ox * k - k * 0.1, k * 0.85);
    }
    ctx.stroke();
  } else {
    ctx.moveTo(-k, 0);
    ctx.quadraticCurveTo(0, -k * 0.95, k, 0);
    ctx.quadraticCurveTo(0, k * 0.95, -k, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, k * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
