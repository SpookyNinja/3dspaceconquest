import './style.css';
import { Engine } from '@babylonjs/core';
import { PlanetId, missionDuration, MetaId, ENEMIES } from './game/data';
import { ALL_ZONES, ZONE_MAPS, zoneById } from './game/zones';
import { World, DT, Choice, MetaBonuses } from './game/world';
import { SaveData, buyMeta, computeRewards, holder, isAttackable, isCaptured, loadSave, metaLevel, newSave, writeSave } from './game/save';
import { MissionView } from './render/mission';
import { SolarSystem } from './render/system';
import { ZoneMapView, ZoneView } from './render/zoneMap';
import { UI, UiHandlers } from './ui';
import { Audio } from './audio';
import { InputState } from './input';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: params.has('shot') }, true);
const input = new InputState(canvas);
const audio = new Audio();
let save: SaveData = loadSave();
audio.volume = save.settings.volume;

type State = 'title' | 'system' | 'map' | 'loading' | 'mission' | 'results';
let state: State = 'title';
const system = new SolarSystem(engine);

interface Mission {
  world: World;
  view: MissionView;
  zoneId: string;
  zoneName: string;
  acc: number;
  paused: boolean;
  choices: Choice[] | null;
  done: boolean;
  endQueued: boolean;
}
let mission: Mission | null = null;
let perfOn = false;

const handlers: UiHandlers = {
  start() {
    audio.unlock();
    audio.preload(['laser_small_000', 'explosion_crunch_000', 'explosion_crunch_002', 'impact_metal_000', 'laser_large_000', 'thruster_fire_000']);
    goSystem();
  },
  selectPlanet(id) {
    if (state === 'system') void openPlanet(id, true);
    else void openPlanet(id, false);
  },
  backToSystem() {
    goSystem();
  },
  selectZone(id) {
    pickZone(id);
  },
  launch() {
    if (ui.zone) void startMission(ui.zone, true);
  },
  buy(id: MetaId) {
    if (buyMeta(save, id)) {
      writeSave(save);
      audio.play('force_field_000', 0.5);
    }
    if (state === 'system') ui.renderSystem(save);
    else ui.renderMap(save);
  },
  choose(i) {
    choose(i);
  },
  reroll() {
    if (!mission || !mission.choices || mission.world.rerolls <= 0) return;
    mission.world.rerolls--;
    mission.choices = mission.world.rollChoices();
    ui.levelUp(mission.choices, mission.world.rerolls);
  },
  resume() {
    if (!mission) return;
    ui.showModal('pause', false);
    mission.paused = false;
  },
  abandon() {
    if (!mission) return;
    ui.showModal('pause', false);
    finishMission(true);
  },
  extract() {
    ui.showModal('timerdone', false);
    finishMission(false);
  },
  continueEndless() {
    if (!mission) return;
    ui.showModal('timerdone', false);
    mission.world.endless = true;
    ui.announce('Endless mode: hold out as long as you can!');
  },
  backToMap() {
    const planet = mission ? zoneById(mission.zoneId)?.planet : undefined;
    mission?.view.dispose();
    mission = null;
    void openPlanet(planet ?? ui.planet, false);
  },
  setVolume(v) {
    save.settings.volume = v;
    audio.volume = v;
    audio.applyVolume();
    writeSave(save);
  },
  setShake(on) {
    save.settings.shake = on;
    if (mission) mission.view.shakeEnabled = on;
    writeSave(save);
  },
  resetSave() {
    save = newSave();
    writeSave(save);
    goSystem();
  },
};
const ui = new UI(handlers);

const zoneMap = new ZoneMapView(document.getElementById('map')!);
zoneMap.onPick = (id) => pickZone(id);
system.onPick = (id) => handlers.selectPlanet(id);

function zoneViews(): Record<string, ZoneView> {
  const out: Record<string, ZoneView> = {};
  for (const z of ALL_ZONES) out[z.id] = { holder: holder(save, z.id), attackable: isAttackable(save, z.id), control: save.control[z.id] ?? 0 };
  return out;
}

function pickZone(id: string) {
  ui.zone = id;
  zoneMap.selected = id;
  ui.renderMap(save);
  if (isAttackable(save, id)) audio.play('computer_noise_000', 0.15, 1.4);
}

function goSystem() {
  state = 'system';
  system.reset();
  ui.renderSystem(save);
  ui.show('system');
  ui.fade(false);
}

/** Solar system → zone map of one planet. With fly, the camera flies to the planet first. */
async function openPlanet(id: PlanetId, fly: boolean) {
  if (fly) {
    state = 'loading';
    const f = system.flyTo(id);
    window.setTimeout(() => ui.fade(true), 650);
    await f;
  }
  state = 'map';
  ui.planet = id;
  zoneMap.show(id);
  zoneMap.setStates(zoneViews());
  const keep = ui.zone && zoneById(ui.zone)?.planet === id && isAttackable(save, ui.zone);
  if (!keep) ui.zone = ZONE_MAPS[id].zones.filter((z) => isAttackable(save, z.id)).sort((a, b) => a.tier - b.tier)[0]?.id ?? null;
  zoneMap.selected = ui.zone;
  ui.renderMap(save);
  ui.show('map');
  layoutZoneMap();
  ui.fade(false);
}

function layoutZoneMap() {
  const wide = window.innerWidth > 820;
  const l = document.querySelector('#map .left')?.getBoundingClientRect();
  const r = document.querySelector('#map .right')?.getBoundingClientRect();
  zoneMap.margins = wide && l && r
    ? { left: l.right + 16, right: window.innerWidth - r.left + 16, top: 16, bottom: 16 }
    : { left: 8, right: 8, top: 8, bottom: Math.round(window.innerHeight * 0.4) };
}

function metaBonuses(): MetaBonuses {
  return {
    hull: metaLevel(save, 'm_hull'),
    armor: metaLevel(save, 'm_armor'),
    damage: metaLevel(save, 'm_damage'),
    firerate: metaLevel(save, 'm_firerate'),
    engine: metaLevel(save, 'm_engine'),
    magnet: metaLevel(save, 'm_magnet'),
    rerolls: metaLevel(save, 'm_reroll'),
  };
}

async function startMission(zoneId: string, animate: boolean) {
  const zone = zoneById(zoneId)!;
  state = 'loading';
  if (animate) {
    const dive = zoneMap.zoomInto(zoneId);
    window.setTimeout(() => ui.fade(true), 800);
    await dive;
  }
  ui.loading(`Descending to ${zone.name}…`);
  const seed = Number(params.get('seed')) || (Date.now() & 0x7fffffff);
  const fast = Number(params.get('fast'));
  const world = new World({ seed, tier: zone.tier, duration: fast > 0 ? fast : missionDuration(zone.tier), meta: metaBonuses() });
  const view = await MissionView.create(engine, world, zone.planet, seed);
  view.shakeEnabled = save.settings.shake;
  mission = { world, view, zoneId, zoneName: zone.name, acc: 0, paused: false, choices: null, done: false, endQueued: false };
  audio.preload(['laser_small_000', 'laser_small_002', 'explosion_crunch_000', 'explosion_crunch_002', 'low_frequency_explosion_000', 'impact_metal_000', 'computer_noise_000', 'force_field_000', 'force_field_002', 'laser_retro_001', 'laser_large_000', 'thruster_fire_000', 'space_engine_large_000', 'door_open_000', 'low_frequency_explosion_001']);
  ui.loading(null);
  ui.fade(false);
  ui.show('hud');
  state = 'mission';
  ui.announce(`${zone.name}: survive ${Math.round(world.duration / 60) || 1} minutes`);
}

function choose(i: number) {
  if (!mission?.choices) return;
  const c = mission.choices[i];
  if (!c) return;
  mission.world.applyChoice(c);
  mission.choices = null;
  ui.showModal('levelup', false);
  audio.play('computer_noise_000', 0.3);
  input.clearPressed();
}

function finishMission(abandoned: boolean) {
  if (!mission || mission.done) return;
  mission.done = true;
  const w = mission.world;
  const zone = zoneById(mission.zoneId)!;
  const success = w.timerReached;
  const rewards = computeRewards(
    {
      zoneId: zone.id, tier: zone.tier, success, bossKilled: w.bossKilled, time: w.t, duration: w.duration,
      endlessTime: w.endless ? Math.max(0, w.t - w.duration) : 0, kills: w.kills, enemyCredits: w.enemyCredits + w.bonusCredits,
    },
    metaLevel(save, 'm_salvage'),
  );
  const wasCaptured = isCaptured(save, zone.id);
  save.credits += rewards.total;
  save.control[zone.id] = Math.min(100, (save.control[zone.id] ?? 0) + rewards.controlGain);
  save.stats.runs++;
  if (success) save.stats.wins++;
  save.stats.kills += w.kills;
  save.stats.bestTime = Math.max(save.stats.bestTime, w.t);
  writeSave(save);
  state = 'results';
  ui.results({ success, zoneName: zone.name, w, rewards, control: save.control[zone.id], captured: !wasCaptured && isCaptured(save, zone.id), abandoned });
}

function missionTick(m: Mission, dt: number) {
  const w = m.world;
  if (input.consume('Escape') || input.consume('KeyP')) {
    if (!m.choices && !ui.modalOpen()) {
      m.paused = true;
      ui.renderPause(save);
      ui.showModal('pause', true);
    } else if (m.paused) handlers.resume();
  }
  if (input.consume('F3')) perfOn = !perfOn;
  if (m.choices) {
    for (let i = 0; i < 3; i++) if (input.consume('Digit' + (i + 1))) choose(i);
    if (input.consume('KeyR')) handlers.reroll();
  }
  const blocked = m.paused || !!m.choices || ui.modalOpen() || m.done || w.over;
  if (!blocked) {
    m.acc += Math.min(dt, 0.25);
    const basis = m.view.screenBasis();
    while (m.acc >= DT) {
      m.acc -= DT;
      const s = input.screenMove();
      let mx = s.x * basis.rx + s.y * basis.fx;
      let mz = s.x * basis.rz + s.y * basis.fz;
      if (s.x === 0 && s.y === 0 && input.mouseDown) {
        const g = m.view.screenToGround(input.mouseX, input.mouseY);
        if (g) {
          const dx = g.x - w.player.x, dz = g.z - w.player.z;
          const d = Math.hypot(dx, dz);
          if (d > 15) {
            mx = (dx / d) * Math.min(1, d / 90);
            mz = (dz / d) * Math.min(1, d / 90);
          }
        }
      }
      w.step({ mx, mz, boost: input.boost });
      for (const ev of w.events) {
        if (ev.type === 'sound') audio.play(ev.id, ev.vol);
        else if (ev.type === 'announce') ui.announce(ev.text);
        else if (ev.type === 'levelup') audio.play('computer_noise_000', 0.35, 1);
      }
      m.view.handleEvents(w.events);
      const timer = w.events.some((e) => e.type === 'timer');
      w.events.length = 0;
      if (timer) {
        ui.showModal('timerdone', true);
        audio.play('force_field_000', 0.6);
        break;
      }
      if (w.pendingLevelUps > 0) {
        m.choices = w.rollChoices();
        ui.levelUp(m.choices, w.rerolls);
        break;
      }
      if (w.over) break;
    }
    if (w.over && !m.endQueued) {
      m.endQueued = true;
      window.setTimeout(() => finishMission(false), 1800); // let the wreck explode first
    }
  }
  m.view.frame(blocked ? 0 : m.acc / DT, blocked ? 0 : dt);
  const st = m.view.stats;
  ui.hud(w, perfOn ? `fps ${st.fps.toFixed(0)}\nenemies ${w.enemies.length}\nprojectiles ${w.projectiles.length}\npickups ${w.pickups.length}\nactive meshes ${st.meshes}\ndraw calls ${engine._drawCalls?.current ?? '-'}` : null);
  m.view.render();
}

canvas.addEventListener('wheel', (e) => {
  if (state === 'mission' && mission) mission.view.zoom = Math.max(420, Math.min(900, mission.view.zoom + e.deltaY * 0.4));
}, { passive: true });

let last = performance.now();
engine.runRenderLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state === 'mission' && mission) {
    missionTick(mission, dt);
  } else if (state === 'results' && mission) {
    mission.view.frame(0, dt);
    mission.view.render();
  } else if (state === 'map') {
    zoneMap.render(dt);
  } else if (state === 'loading' && !mission) {
    if (ui.planet && document.querySelector('#map.on')) zoneMap.render(dt);
    else {
      system.update(dt);
      system.render();
    }
  } else {
    system.update(dt);
    system.render();
    if (state === 'system') {
      const l = document.querySelector('#system .left')?.getBoundingClientRect();
      system.screenShift = l && window.innerWidth > 820 ? l.right / 2 : 0;
      ui.placeLabels((id) => system.labelPos(id), system.hover);
    }
  }
});
window.addEventListener('resize', () => {
  engine.resize();
  if (state === 'map') layoutZoneMap();
});

// Dev shortcuts for testing: ?play=<zoneId or planet id> skips the menus, ?fast=<seconds> shortens the timer,
// ?view=system|map opens a menu screen directly.
const play = params.get('play');
const playZone = play ? (zoneById(play)?.id ?? (ZONE_MAPS[play as PlanetId] ? ZONE_MAPS[play as PlanetId].zones.find((z) => isAttackable(save, z.id))?.id : undefined)) : undefined;
if (playZone) {
  void startMission(playZone, false);
} else if (params.get('view') === 'system') {
  goSystem();
} else if (params.get('view') === 'map') {
  void openPlanet((params.get('planet') as PlanetId) ?? 'megacity', false);
} else {
  ui.show('title');
}
// Exposed for automated browser tests and debugging in the console.
(window as unknown as { __game: unknown }).__game = {
  get mission() { return mission; },
  get state() { return state; },
  spawn(id: string, dx = 120, dz = 0) {
    const w = mission?.world;
    if (w) w.spawnEnemy(ENEMIES[id], w.player.x + dx, w.player.z + dz, id === 'boss' || id === 'elite');
  },
};
