// HTML overlay for menus and HUD (SPEC §6.2: HTML/CSS for menus, Babylon only for the 3D world).
import { FACTIONS, FactionId, META, MetaId, PASSIVES, PLANETS, PlanetId, WEAPONS, missionDuration } from './game/data';
import { ZONE_MAPS, zoneById } from './game/zones';
import { Choice, World } from './game/world';
import { CreditBreakdown, SaveData, fmtTime, holder, isAttackable, metaLevel } from './game/save';

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const rgb = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const TARGETING_TEXT: Record<string, string> = {
  nearest: 'nearest enemy',
  heaviest: 'toughest enemy',
  cluster: 'densest cluster',
  spread: 'spread across targets',
  around: 'all around the ship',
  projectiles: 'enemy missiles first',
};

export interface UiHandlers {
  start(): void;
  selectPlanet(id: PlanetId): void;
  selectZone(id: string): void;
  backToSystem(): void;
  launch(): void;
  buy(id: MetaId): void;
  choose(i: number): void;
  reroll(): void;
  resume(): void;
  abandon(): void;
  extract(): void;
  continueEndless(): void;
  backToMap(): void;
  setVolume(v: number): void;
  setShake(on: boolean): void;
  resetSave(): void;
}

export class UI {
  private root: HTMLElement;
  private screens: Record<string, HTMLElement> = {};
  private announceTimer = 0;
  private announceQueue: string[] = [];
  planet: PlanetId = 'megacity';
  zone: string | null = null;
  private labels: Partial<Record<PlanetId, HTMLElement>> = {};

  constructor(h: UiHandlers) {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = `
      <div class="screen" id="title">
        <div>
          <div class="logo">SPACE CONQUEST*</div>
          <p>Command a colossal Alliance battlecruiser. Its weapons aim and fire on their own: you steer and pick upgrades.
             Choose a planet, strike an enemy zone on the front line, descend to the surface and hold out until the timer runs out.</p>
          <button class="primary" data-a="start">Start</button>
          <p class="small">WASD or arrows: steer · hold left mouse: fly to cursor · Space: afterburner · Esc: pause<br>Prototype build. Names with * are placeholders.</p>
        </div>
      </div>
      <div class="screen" id="system">
        <div class="plabels"></div>
        <div class="panel left"></div>
      </div>
      <div class="screen" id="map">
        <div class="panel left"></div>
        <div class="panel right hangar"></div>
        <div class="help panel">
          <b>Controls</b><br>WASD / arrows: steer · Hold left mouse: fly toward cursor · Space / Shift: afterburner<br>
          Esc / P: pause · Mouse wheel: zoom · F3: performance overlay · Touch: drag anywhere to steer
        </div>
      </div>
      <div class="screen" id="hud">
        <div class="vignette"></div>
        <div class="top">
          <div class="xpbar"><i></i></div>
          <div class="toprow">
            <div class="lvl"></div>
            <div class="timer"></div>
            <div class="kills"></div>
          </div>
        </div>
        <div class="boss"><div class="bname">Enemy flagship</div><div class="bar"><i></i></div></div>
        <div class="announce"></div>
        <div class="bottom">
          <div class="weapons"></div>
          <div class="hull"><i></i><span></span></div>
          <div class="boost"></div>
        </div>
        <button class="pausebtn" data-a="pause">II</button>
        <div class="perf"></div>
        <div class="modal" id="levelup"><div class="box">
          <h2>Level up!</h2><div class="muted small">Pick one. Keys 1, 2, 3 work too.</div>
          <div class="cards"></div>
          <div class="btnrow"><button data-a="reroll" class="reroll"></button></div>
        </div></div>
        <div class="modal" id="pause"><div class="box" style="max-width:420px">
          <h2>Paused</h2>
          <div class="settings"></div>
          <div class="btnrow"><button class="primary" data-a="resume">Resume</button><button data-a="abandon">Abandon mission</button></div>
        </div></div>
        <div class="modal" id="timerdone"><div class="box" style="max-width:520px">
          <h2>Zone secured!</h2>
          <p>The mission timer is up and the run counts as a <b>success</b>. Extract now to bank your rewards, or stay for
          <b>endless mode</b>: enemies keep getting stronger and every extra minute pays bonus credits. Dying in endless mode keeps everything.</p>
          <div class="btnrow"><button class="primary" data-a="extract">Extract</button><button data-a="endless">Continue (endless)</button></div>
        </div></div>
      </div>
      <div class="screen" id="results"><div class="modal on"><div class="box" style="max-width:560px"></div></div></div>
      <div class="loading"><div class="ltext">Loading…</div></div>
      <div class="fade"></div>
    `;
    for (const id of ['title', 'system', 'map', 'hud', 'results']) this.screens[id] = $(this.root, '#' + id);
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled) return;
      const a = el.dataset.a!;
      const v = el.dataset.v ?? '';
      switch (a) {
        case 'start': return h.start();
        case 'planet': return h.selectPlanet(v as PlanetId);
        case 'system': return h.backToSystem();
        case 'zone': return h.selectZone(v);
        case 'launch': return h.launch();
        case 'buy': return h.buy(v as MetaId);
        case 'choose': return h.choose(Number(v));
        case 'reroll': return h.reroll();
        case 'pause': return this.showModal('pause', true);
        case 'resume': return h.resume();
        case 'abandon': return h.abandon();
        case 'extract': return h.extract();
        case 'endless': return h.continueEndless();
        case 'back': return h.backToMap();
        case 'reset': if (confirm('Delete all progress (credits, upgrades, captured zones)?')) h.resetSave(); return;
      }
    });
    this.root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.name === 'volume') h.setVolume(Number(el.value) / 100);
      if (el.name === 'shake') h.setShake(el.checked);
    });
  }

  show(id: 'title' | 'system' | 'map' | 'hud' | 'results') {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('on', k === id);
  }

  showModal(id: 'levelup' | 'pause' | 'timerdone', on: boolean) {
    $(this.root, '#' + id).classList.toggle('on', on);
  }

  modalOpen(): boolean {
    return !!this.root.querySelector('#hud .modal.on');
  }

  loading(text: string | null) {
    const l = $(this.root, '.loading');
    l.classList.toggle('on', text !== null);
    if (text) $(l, '.ltext').textContent = text;
  }

  fade(on: boolean) {
    $(this.root, '.fade').classList.toggle('on', on);
  }

  // ---------- solar system, zone map, hangar ----------
  private legend(planet: (typeof PLANETS)[number]) {
    return `<div class="legend">${(['alliance', ...planet.factions.map((f) => f.id)] as FactionId[])
      .map((f) => `<span><i style="background:${rgb(FACTIONS[f].color)}"></i>${esc(FACTIONS[f].name)}</span>`)
      .join('')}</div>`;
  }

  private planetCounts(save: SaveData, id: PlanetId) {
    const zones = ZONE_MAPS[id].zones;
    return {
      total: zones.length,
      held: zones.filter((z) => holder(save, z.id) === 'alliance').length,
      front: zones.filter((z) => isAttackable(save, z.id)).length,
    };
  }

  renderSystem(save: SaveData) {
    const cards = PLANETS.map((p) => {
      const c = this.planetCounts(save, p.id);
      return `<button class="zone" data-a="planet" data-v="${p.id}">
        <div class="row"><b>${esc(p.name)}</b><span class="muted small">Tier ${p.baseTier}+</span></div>
        <div class="muted small">${esc(p.blurb)}</div>
        ${this.legend(p)}
        <div class="bar"><i style="width:${(c.held / c.total) * 100}%"></i></div>
        <div class="state"><span style="color:var(--accent)">Alliance holds ${c.held}/${c.total} zones</span> · <span style="color:var(--warn)">${c.front} on the front line</span></div>
      </button>`;
    }).join('');
    $(this.root, '#system .left').innerHTML = `<h2>Sector*</h2>
      <div class="muted small">Pick a planet to open its zone map. Click a planet in space or a card below.</div>${cards}
      <div class="muted small" style="margin-top:8px">${Math.floor(save.credits)} ¢ · upgrades are in the hangar on each zone map.</div>`;
    $(this.root, '#system .plabels').innerHTML = PLANETS.map((p) => `<button class="plabel" data-a="planet" data-v="${p.id}">${esc(p.name)}</button>`).join('');
    this.labels = {};
    for (const p of PLANETS) this.labels[p.id] = $(this.root, `#system .plabel[data-v="${p.id}"]`);
  }

  placeLabels(pos: (id: PlanetId) => { x: number; y: number } | null, hover: PlanetId | null) {
    for (const [id, el] of Object.entries(this.labels) as [PlanetId, HTMLElement][]) {
      const p = pos(id);
      el.style.display = p ? '' : 'none';
      if (p) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      el.classList.toggle('hot', id === hover);
    }
  }

  renderMap(save: SaveData) {
    const planet = PLANETS.find((p) => p.id === this.planet)!;
    const c = this.planetCounts(save, planet.id);
    const sel = this.zone ? zoneById(this.zone) : undefined;
    let detail = `<div class="muted small" style="margin-top:10px">Select a zone on the map. Zones with orange attack arrows border Alliance territory and can be attacked.</div>`;
    if (sel) {
      const h = holder(save, sel.id);
      const att = isAttackable(save, sel.id);
      const ctl = Math.min(100, save.control[sel.id] ?? 0);
      const state = h === 'alliance'
        ? '<span style="color:var(--accent)">Alliance territory</span>'
        : `<span style="color:${rgb(FACTIONS[h].color)}">${esc(FACTIONS[h].name)}</span> · ${att ? '<span style="color:var(--warn)">front line, attackable</span>' : '<span class="muted">behind enemy lines</span>'}`;
      detail = `<div class="zone sel" style="cursor:default">
          <div class="row"><b>${esc(sel.name)}</b>${h === 'alliance' ? '' : `<span class="muted small">${sel.capital ? 'Fortress · ' : ''}Tier ${sel.tier} · ${missionDuration(sel.tier) / 60} min</span>`}</div>
          <div class="state">${state}</div>
          ${h === 'alliance' ? '' : `<div class="bar"><i style="width:${ctl}%"></i></div><div class="muted small">Control ${ctl}%</div>`}
        </div>
        <button class="primary launch" data-a="launch" ${att ? '' : 'disabled'}>
          ${att ? `Descend to ${esc(sel.name)}` : h === 'alliance' ? 'Held by the Alliance' : 'Not on the front line yet'}
        </button>`;
    }
    $(this.root, '#map .left').innerHTML = `
      <button data-a="system" class="back">◂ Solar system</button>
      <h2 style="margin-top:10px">${esc(planet.name)}</h2>
      <div class="muted small">${esc(planet.blurb)}</div>
      ${this.legend(planet)}
      <div class="bar"><i style="width:${(c.held / c.total) * 100}%"></i></div>
      <div class="state small"><span style="color:var(--accent)">Alliance holds ${c.held}/${c.total} zones</span> · <span style="color:var(--warn)">${c.front} attackable</span></div>
      ${detail}
      <div class="muted small" style="margin-top:8px">A successful mission adds 35% Control (+10% for the flagship). At 100% the zone joins the Alliance and its neighbours become new targets.</div>`;
    this.renderHangar(save);
  }

  private renderHangar(save: SaveData) {
    const ups = (Object.keys(META) as MetaId[])
      .map((id) => {
        const d = META[id];
        const lvl = metaLevel(save, id);
        const max = lvl >= d.max;
        const cost = max ? 0 : d.cost(lvl);
        return `<div class="upg"><div class="info"><b>${esc(d.name)}</b><div class="muted small">${esc(d.desc)}</div>
          <div class="pips">${'■'.repeat(lvl)}${'□'.repeat(d.max - lvl)}</div></div>
          <button data-a="buy" data-v="${id}" ${max || save.credits < cost ? 'disabled' : ''}>${max ? 'MAX' : cost + ' ¢'}</button></div>`;
      })
      .join('');
    const html = `
      <div class="muted small">Credits</div><div class="credits">${Math.floor(save.credits)} ¢</div>
      <div class="muted small" style="margin:4px 0 8px">Runs ${save.stats.runs} · Wins ${save.stats.wins} · Kills ${save.stats.kills} · Best ${fmtTime(save.stats.bestTime)}</div>
      <h3>Permanent upgrades</h3>${ups}
      <details style="margin-top:10px"><summary class="muted small" style="pointer-events:auto;cursor:pointer">Settings</summary>${this.settingsHtml(save)}
        <button data-a="reset" style="margin-top:8px">Reset save</button></details>`;
    this.root.querySelectorAll('.hangar').forEach((el) => {
      const open = (el.querySelector('details') as HTMLDetailsElement | null)?.open;
      el.innerHTML = html;
      if (open) (el.querySelector('details') as HTMLDetailsElement).open = true;
    });
  }

  private settingsHtml(save: SaveData) {
    return `<label class="opt">Volume <input name="volume" type="range" min="0" max="100" value="${Math.round(save.settings.volume * 100)}"></label>
      <label class="opt">Screen shake <input name="shake" type="checkbox" ${save.settings.shake ? 'checked' : ''}></label>`;
  }

  renderPause(save: SaveData) {
    $(this.root, '#pause .settings').innerHTML = this.settingsHtml(save);
  }

  // ---------- HUD ----------
  hud(w: World, perf: string | null) {
    const p = w.player;
    $(this.root, '#hud .xpbar > i').style.width = `${(p.xp / p.xpNext) * 100}%`;
    $(this.root, '#hud .lvl').textContent = `Level ${p.level}`;
    const t = $(this.root, '#hud .timer');
    if (w.endless) {
      t.innerHTML = `${fmtTime(w.t - w.duration)}<small>ENDLESS · bonus time</small>`;
      t.classList.add('endless');
    } else {
      t.innerHTML = `${fmtTime(Math.max(0, w.duration - w.t))}<small>until zone secured</small>`;
      t.classList.remove('endless');
    }
    $(this.root, '#hud .kills').textContent = `${w.kills} kills`;
    $(this.root, '#hud .hull > i').style.width = `${(p.hull / p.maxHull) * 100}%`;
    $(this.root, '#hud .hull > span').textContent = `HULL ${Math.ceil(p.hull)} / ${Math.round(p.maxHull)}`;
    const wp = p.weapons.map((x) => `<span class="wpn">${WEAPONS[x.id].name} <b>${x.level}</b></span>`).join('') +
      Object.entries(p.passives).map(([id, l]) => `<span class="wpn" style="border-color:#1f4a35">${PASSIVES[id as keyof typeof PASSIVES].name} <b style="color:var(--good)">${l}</b></span>`).join('');
    const we = $(this.root, '#hud .weapons');
    if (we.dataset.k !== wp) {
      we.innerHTML = wp;
      we.dataset.k = wp;
    }
    const b = $(this.root, '#hud .boost');
    const ready = p.boostCd <= 0;
    b.textContent = p.boostTime > 0 ? 'AFTERBURNER ACTIVE' : ready ? 'Afterburner ready (Space)' : `Afterburner ${Math.ceil(p.boostCd)}s`;
    b.classList.toggle('ready', ready);
    const boss = $(this.root, '#hud .boss');
    const be = w.boss && w.boss.alive ? w.boss : w.enemies.find((e) => e.isBoss && e.alive);
    boss.classList.toggle('on', !!be);
    if (be) {
      $(boss, '.bname').textContent = be.def.id === 'boss' ? 'Enemy flagship' : 'Elite frigate';
      $(boss, '.bar > i').style.width = `${(be.hp / be.maxHp) * 100}%`;
    }
    $(this.root, '#hud .vignette').style.opacity = String(p.hitFlash > 0 ? 0.5 : p.hull / p.maxHull < 0.25 ? 0.25 : 0);
    const pe = $(this.root, '#hud .perf');
    pe.classList.toggle('on', perf !== null);
    if (perf) pe.textContent = perf;
  }

  announce(text: string) {
    if (this.announceQueue[this.announceQueue.length - 1] === text) return;
    this.announceQueue.push(text);
    if (this.announceQueue.length === 1) this.nextAnnounce();
  }

  private nextAnnounce() {
    const el = $(this.root, '#hud .announce');
    const text = this.announceQueue[0];
    if (!text) return;
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => {
      el.classList.remove('on');
      window.setTimeout(() => {
        this.announceQueue.shift();
        this.nextAnnounce();
      }, 400);
    }, 2200);
  }

  levelUp(choices: Choice[], rerolls: number) {
    const cards = choices
      .map((c, i) => {
        let tag = '', name = '', body = '';
        if (c.kind === 'weapon') {
          const d = WEAPONS[c.id];
          name = d.name;
          if (c.level === 1) {
            tag = '<div class="tag">New weapon</div>';
            body = `${esc(d.desc)}<div class="muted small" style="margin-top:6px">Targets: ${TARGETING_TEXT[d.targeting]}</div>`;
          } else {
            tag = `<div class="tag up">Upgrade · level ${c.level}</div>`;
            body = esc(d.levelText[c.level - 1]);
          }
        } else if (c.kind === 'passive') {
          const d = PASSIVES[c.id];
          name = d.name;
          tag = `<div class="tag pas">${c.level === 1 ? 'New system' : 'System · level ' + c.level}</div>`;
          body = esc(d.desc);
        } else if (c.kind === 'heal') {
          name = 'Emergency repairs';
          tag = '<div class="tag pas">Repair</div>';
          body = 'Repair 30% hull';
        } else {
          name = 'Salvage';
          tag = '<div class="tag">Credits</div>';
          body = '+25 credits at the end of the mission';
        }
        return `<div class="card" data-a="choose" data-v="${i}"><span class="key">${i + 1}</span>${tag}<h3>${esc(name)}</h3><div class="muted">${body}</div></div>`;
      })
      .join('');
    $(this.root, '#levelup .cards').innerHTML = cards;
    const r = $<HTMLButtonElement>(this.root, '#levelup .reroll');
    r.textContent = `Reroll (${rerolls} left, R)`;
    r.disabled = rerolls <= 0;
    r.style.display = rerolls > 0 ? '' : 'none';
    this.showModal('levelup', true);
  }

  results(opts: { success: boolean; zoneName: string; w: World; rewards: CreditBreakdown; control: number; captured: boolean; abandoned: boolean }) {
    const { w, rewards } = opts;
    const title = opts.success ? 'Mission success' : opts.abandoned ? 'Mission abandoned' : 'Battlecruiser destroyed';
    const worst = Object.entries(w.damageTaken).sort((a, b) => b[1] - a[1])[0];
    $(this.root, '#results .box').innerHTML = `
      <h2 style="color:${opts.success ? 'var(--good)' : 'var(--bad)'}">${title}</h2>
      <div class="muted">${esc(opts.zoneName)} · survived ${fmtTime(w.t)} · level ${w.player.level} · ${w.kills} kills${w.bossKilled ? ' · flagship destroyed' : ''}</div>
      ${worst ? `<div class="muted small">Most damage taken from ${worst[0]}</div>` : ''}
      <div class="lines">${rewards.lines.map((l) => `<div><span>${esc(l.label)}</span><span>+${l.amount}</span></div>`).join('')}
        <div class="total"><span>Credits earned</span><span>${rewards.total} ¢</span></div></div>
      <div style="max-width:420px;margin:0 auto;text-align:left">
        <div class="small muted">Zone Control +${rewards.controlGain}% → ${opts.control}%${opts.captured ? ' · <b style="color:var(--accent)">ZONE CAPTURED!</b>' : ''}</div>
        <div class="bar"><i style="width:${opts.control}%"></i></div>
      </div>
      <div class="btnrow" style="margin-top:16px"><button class="primary" data-a="back">Return to zone map</button></div>`;
    this.show('results');
  }
}
