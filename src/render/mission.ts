import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  AssetContainer,
} from '@babylonjs/core';
import { ASSET_BASE, ModelLibrary, ThinPool, emissiveMat } from './common';
import { createSurface, Surface } from './surface';
import { World, GameEvent, Enemy, angleDiff, DT } from '../game/world';
import { ENEMIES, PLAYER_BASE, PLAYER_HARDPOINTS, WEAPONS, WeaponId } from '../game/data';

const CAM_ALPHA = -Math.PI / 2 - 0.35; // slight yaw offset so one flank of the ship is visible (SPEC §5.1)
const CAM_BETA = 0.6; // ~56° pitch, approved by Andre
const PROJ_Y = 5;

interface Beam {
  pool: ThinPool;
  x1: number; z1: number; x2: number; z2: number;
  width: number; life: number; max: number;
}

export class MissionView {
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private lib: ModelLibrary;
  private surface!: Surface;
  private player!: TransformNode;
  private turrets: (TransformNode | null)[] = [];
  private trail!: ParticleSystem;
  private containers = new Map<string, AssetContainer>();
  private enemyPools = new Map<string, TransformNode[]>();
  private enemyViews = new Map<Enemy, TransformNode>();
  private proj: Record<string, ThinPool> = {};
  private pick: Record<string, ThinPool> = {};
  private beamPools = new Map<string, ThinPool>();
  private beams: Beam[] = [];
  private rings: { mesh: Mesh; mat: StandardMaterial; t: number; r: number; x: number; z: number }[] = [];
  private booms: ParticleSystem[] = [];
  private fireballs: ParticleSystem[] = [];
  private smokes: ParticleSystem[] = [];
  private sparks: ParticleSystem[] = [];
  private boomIdx = 0;
  private sparkIdx = 0;
  private camX = 0;
  private camZ = 0;
  private shake = 0;
  private bank = 0;
  zoom = 560;
  shakeEnabled = true;
  private time = 0;
  private glow!: GlowLayer;

  private constructor(private engine: Engine, private world: World, private planet: 'megacity' | 'ocean') {
    this.scene = new Scene(engine);
    this.scene.skipPointerMovePicking = true;
    this.lib = new ModelLibrary(this.scene);
    this.camera = new ArcRotateCamera('cam', CAM_ALPHA, CAM_BETA, this.zoom, Vector3.Zero(), this.scene);
    this.camera.minZ = 1;
    this.camera.maxZ = 6000;
    this.camera.fov = 0.8;
  }

  static async create(engine: Engine, world: World, planet: 'megacity' | 'ocean', seed: number): Promise<MissionView> {
    const v = new MissionView(engine, world, planet);
    await v.build(seed);
    return v;
  }

  private async build(seed: number) {
    const scene = this.scene;
    const night = this.planet === 'megacity';
    const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, 0.45), scene);
    sun.intensity = night ? 1.3 : 1.9;
    sun.diffuse = night ? new Color3(0.75, 0.82, 1) : new Color3(1, 0.97, 0.9);
    const hemi = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
    hemi.intensity = night ? 0.45 : 0.6;
    hemi.groundColor = night ? new Color3(0.35, 0.22, 0.12) : new Color3(0.1, 0.25, 0.35); // city glow / sea bounce
    const glow = (this.glow = new GlowLayer('glow', scene, { blurKernelSize: 32 }));
    glow.intensity = 0.8;

    this.surface = createSurface(this.planet, scene, this.lib, seed);

    // Preload every ship model so instancing during play is synchronous.
    const models = new Set(['player_battlecruiser', ...Object.values(ENEMIES).map((e) => e.model)]);
    await Promise.all(
      [...models].map(async (m) => {
        const c = await this.lib.load(`ships/${m}`);
        // Faint faction glow keeps small ships readable against a busy surface.
        const glowTint = m.startsWith('player') ? new Color3(0, 0, 0) : new Color3(0.1, 0.015, 0.015);
        for (const mat of c.materials) {
          const pm = mat as unknown as { emissiveColor?: Color3 };
          if (pm.emissiveColor) pm.emissiveColor = glowTint;
        }
        this.containers.set(m, c);
      }),
    );

    this.player = this.lib.instanceFrom(this.containers.get('player_battlecruiser')!, 'player');
    this.player.scaling.setAll(PLAYER_BASE.scale);
    this.buildTurrets();
    this.trail = this.engineTrail();

    // Projectiles and pickups: one thin-instance pool per look.
    const box = (name: string, w: number, h: number, d: number, c: [number, number, number]) => {
      const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      m.material = emissiveMat(scene, name + 'M', c);
      return m;
    };
    const ball = (name: string, d: number, c: [number, number, number]) => {
      const m = MeshBuilder.CreateSphere(name, { diameter: d, segments: 6 }, scene);
      m.material = emissiveMat(scene, name + 'M', c);
      return m;
    };
    this.proj.pulse = new ThinPool(box('pulse', 1.3, 1.3, 10, [0.4, 0.9, 1.4]), 256);
    this.proj.pd = new ThinPool(box('pd', 0.8, 0.8, 5, [1.4, 1.3, 0.8]), 256);
    this.proj.missile = new ThinPool(box('missile', 1.8, 1.8, 5, [1.6, 0.7, 0.2]), 128);
    this.proj.flak = new ThinPool(ball('flak', 3.5, [1.5, 1.2, 0.4]), 64);
    this.proj.ebolt = new ThinPool(ball('ebolt', 4.2, [1.8, 0.25, 0.35]), 512);
    this.proj.emissile = new ThinPool(box('emissile', 2.4, 2.4, 7, [1.6, 0.2, 1.4]), 64);
    const shard = MeshBuilder.CreatePolyhedron('xp', { type: 1, size: 1.6 }, scene);
    shard.material = emissiveMat(scene, 'xpM', [0.3, 1.5, 0.6]);
    this.pick.xp = new ThinPool(shard, 512);
    this.pick.repair = new ThinPool(box('repair', 6, 6, 6, [1.4, 1.5, 1.4]), 16);
    const mag = MeshBuilder.CreateTorus('magnet', { diameter: 8, thickness: 1.6, tessellation: 16 }, scene);
    mag.material = emissiveMat(scene, 'magM', [0.4, 0.7, 1.6]);
    this.pick.magnet = new ThinPool(mag, 8);

    for (let i = 0; i < 6; i++) {
      const mesh = MeshBuilder.CreateTorus('ring', { diameter: 2, thickness: 0.06, tessellation: 64 }, scene);
      const mat = emissiveMat(scene, 'ringM' + i, [0.5, 1.4, 1.1], 0);
      mesh.material = mat;
      mesh.isVisible = false;
      this.rings.push({ mesh, mat, t: 1, r: 0, x: 0, z: 0 });
    }
    this.buildParticles();
    // Only weapon effects glow; hulls and buildings stay crisp.
    for (const mesh of scene.meshes) if (mesh.material?.name.match(/M$|^ta|^ringM|^cars/)) glow.addIncludedOnlyMesh(mesh as Mesh);
    this.frame(0, 0);
  }

  private buildTurrets() {
    const scene = this.scene;
    const metal = new StandardMaterial('turretMetal', scene);
    metal.diffuseColor = new Color3(0.42, 0.46, 0.55);
    metal.specularColor = new Color3(0.3, 0.3, 0.35);
    const owner: (WeaponId | null)[] = PLAYER_HARDPOINTS.map(() => null);
    for (const w of Object.values(WEAPONS)) for (const h of w.hardpoints) owner[h] = w.id;
    this.turrets = PLAYER_HARDPOINTS.map((hp, i) => {
      const id = owner[i];
      if (!id) return null;
      const def = WEAPONS[id];
      const root = new TransformNode('turret' + i, scene);
      root.parent = this.player;
      root.position.set(hp.x, hp.y, hp.z);
      const big = id === 'rail' || id === 'flak' || id === 'missile';
      const base = MeshBuilder.CreateCylinder('tb' + i, { diameter: big ? 1.1 : 0.75, height: 0.35, tessellation: 10 }, scene);
      base.material = metal;
      base.parent = root;
      const accent = emissiveMat(scene, 'ta' + i, def.color.map((c) => c * 0.9) as [number, number, number]);
      if (id === 'missile') {
        const pod = MeshBuilder.CreateBox('tp' + i, { width: 0.9, height: 0.45, depth: 0.9 }, scene);
        pod.material = metal;
        pod.parent = root;
        pod.position.y = 0.3;
        const tip = MeshBuilder.CreateBox('tt' + i, { width: 0.7, height: 0.2, depth: 0.1 }, scene);
        tip.material = accent;
        tip.parent = root;
        tip.position.set(0, 0.32, 0.46);
      } else {
        const len = id === 'rail' ? 2.4 : id === 'pd' ? 0.7 : 1.1;
        const n = id === 'flak' ? 2 : 1;
        for (let b = 0; b < n; b++) {
          const barrel = MeshBuilder.CreateBox('tbar' + i + b, { width: 0.16, height: 0.16, depth: len }, scene);
          barrel.material = metal;
          barrel.parent = root;
          barrel.position.set(n > 1 ? (b ? 0.18 : -0.18) : 0, 0.25, len / 2);
          const tip = MeshBuilder.CreateBox('ttip' + i + b, { width: 0.18, height: 0.18, depth: 0.12 }, scene);
          tip.material = accent;
          tip.parent = barrel;
          tip.position.z = len / 2;
        }
      }
      root.setEnabled(false);
      return root;
    });
  }

  private engineTrail(): ParticleSystem {
    const ps = new ParticleSystem('trail', 400, this.scene);
    ps.particleTexture = new Texture(ASSET_BASE + 'sprites/particles/flare_01.png', this.scene);
    const e = new TransformNode('trailEmit', this.scene);
    e.parent = this.player;
    e.position.set(0, 0.2, -9.4);
    ps.emitter = e as unknown as Vector3;
    ps.minEmitBox = new Vector3(-0.6, 0, 0);
    ps.maxEmitBox = new Vector3(0.6, 0, 0);
    ps.color1 = new Color4(0.45, 0.75, 1, 1);
    ps.color2 = new Color4(0.25, 0.45, 1, 1);
    ps.colorDead = new Color4(0, 0, 0.2, 0);
    ps.minSize = 8;
    ps.maxSize = 14;
    ps.minLifeTime = 0.12;
    ps.maxLifeTime = 0.3;
    ps.emitRate = 160;
    ps.direction1 = ps.direction2 = Vector3.Zero();
    ps.minEmitPower = ps.maxEmitPower = 0;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();
    return ps;
  }

  private buildParticles() {
    const scene = this.scene;
    const mk = (name: string, sprite: string, cap: number, add: boolean) => {
      const ps = new ParticleSystem(name, cap, scene);
      ps.particleTexture = new Texture(ASSET_BASE + 'sprites/particles/' + sprite, scene);
      ps.emitter = new Vector3(0, -9999, 0);
      ps.emitRate = 0;
      ps.manualEmitCount = 0;
      ps.blendMode = add ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
      ps.createSphereEmitter(1);
      ps.start();
      return ps;
    };
    for (let i = 0; i < 16; i++) {
      const b = mk('boom', 'spark_04.png', 150, true);
      b.color1 = new Color4(1, 0.85, 0.5, 1);
      b.color2 = new Color4(1, 0.45, 0.15, 1);
      b.colorDead = new Color4(0.2, 0, 0, 0);
      b.minLifeTime = 0.25;
      b.maxLifeTime = 0.8;
      this.booms.push(b);
      const f = mk('fireball', 'fire_02.png', 60, true);
      f.color1 = new Color4(0.9, 0.5, 0.2, 0.8);
      f.color2 = new Color4(0.8, 0.25, 0.05, 0.6);
      f.colorDead = new Color4(0.1, 0, 0, 0);
      f.minLifeTime = 0.3;
      f.maxLifeTime = 0.7;
      this.fireballs.push(f);
      const s = mk('smoke', 'smoke_04.png', 40, false);
      s.color1 = new Color4(0.35, 0.32, 0.3, 0.55);
      s.color2 = new Color4(0.2, 0.2, 0.22, 0.45);
      s.colorDead = new Color4(0, 0, 0, 0);
      s.minLifeTime = 0.9;
      s.maxLifeTime = 2;
      this.smokes.push(s);
    }
    for (let i = 0; i < 12; i++) {
      const s = mk('spark', 'spark_01.png', 40, true);
      s.color1 = new Color4(1, 0.95, 0.7, 1);
      s.color2 = new Color4(0.6, 0.85, 1, 1);
      s.colorDead = new Color4(0, 0, 0, 0);
      s.minLifeTime = 0.08;
      s.maxLifeTime = 0.22;
      s.minSize = 1.5;
      s.maxSize = 3.5;
      s.minEmitPower = 30;
      s.maxEmitPower = 80;
      this.sparks.push(s);
    }
  }

  private explode(x: number, z: number, size: number) {
    const i = this.boomIdx++ % this.booms.length;
    const s = Math.max(0.6, Math.min(size, 14));
    const y = PROJ_Y;
    const b = this.booms[i], f = this.fireballs[i], sm = this.smokes[i];
    (b.emitter as Vector3).set(x, y, z);
    b.minSize = 1.2 * s; b.maxSize = 3.5 * s; b.minEmitPower = 12 * s; b.maxEmitPower = 35 * s;
    b.manualEmitCount = Math.min(150, Math.round(30 + s * 12));
    (f.emitter as Vector3).set(x, y, z);
    f.minSize = 4 * s; f.maxSize = 9 * s; f.minEmitPower = 2 * s; f.maxEmitPower = 8 * s;
    f.manualEmitCount = Math.min(30, Math.round(3 + s * 2));
    if (s > 1.2) {
      (sm.emitter as Vector3).set(x, y - 2, z);
      sm.minSize = 5 * s; sm.maxSize = 12 * s; sm.minEmitPower = 1 * s; sm.maxEmitPower = 4 * s;
      sm.manualEmitCount = Math.min(40, Math.round(4 + s * 3));
    }
  }

  private spark(x: number, z: number, n = 8) {
    const s = this.sparks[this.sparkIdx++ % this.sparks.length];
    (s.emitter as Vector3).set(x, PROJ_Y, z);
    s.manualEmitCount = n;
  }

  private beamPool(color: [number, number, number]): ThinPool {
    const key = color.join(',');
    let p = this.beamPools.get(key);
    if (!p) {
      const m = MeshBuilder.CreateBox('beam' + key, { size: 1 }, this.scene);
      m.material = emissiveMat(this.scene, 'beamM' + key, color.map((c) => c * 1.6) as [number, number, number]);
      p = new ThinPool(m, 64);
      this.glow.addIncludedOnlyMesh(m);
      this.beamPools.set(key, p);
    }
    return p;
  }

  handleEvents(events: GameEvent[]) {
    for (const ev of events) {
      switch (ev.type) {
        case 'explosion':
          this.explode(ev.x, ev.z, ev.size);
          break;
        case 'hit':
          this.spark(ev.x, ev.z, ev.enemy ? 6 : 12);
          break;
        case 'muzzle':
          this.spark(ev.x, ev.z, 2);
          break;
        case 'beam':
          this.beams.push({ pool: this.beamPool(ev.color), x1: ev.x1, z1: ev.z1, x2: ev.x2, z2: ev.z2, width: ev.width, life: ev.life, max: ev.life });
          break;
        case 'shock': {
          const r = this.rings.find((q) => q.t >= 1) ?? this.rings[0];
          r.t = 0;
          r.r = ev.r;
          r.x = ev.x;
          r.z = ev.z;
          break;
        }
        case 'shake':
          if (this.shakeEnabled) this.shake = Math.min(6, this.shake + ev.amt * 2);
          break;
        default:
          break;
      }
    }
  }

  /** alpha = interpolation factor between the last two sim steps; dt = real frame time. */
  frame(alpha: number, dt: number) {
    const w = this.world;
    this.time += dt;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const p = w.player;
    const px = lerp(p.px, p.x), pz = lerp(p.pz, p.z);
    const heading = p.pheading + angleDiff(p.pheading, p.heading) * alpha;
    const turnRate = angleDiff(p.pheading, p.heading) / DT;
    this.bank += (Math.max(-0.25, Math.min(0.25, -turnRate * 0.35)) - this.bank) * Math.min(1, dt * 3);
    this.player.position.set(px, 0, pz);
    this.player.rotation.set(0, heading, this.bank);
    this.player.setEnabled(!w.over);
    const boosting = p.boostTime > 0;
    this.trail.emitRate = boosting ? 420 : 160;
    this.trail.minSize = boosting ? 12 : 8;
    this.trail.maxSize = boosting ? 22 : 14;

    p.turretAim.forEach((aim, i) => {
      const t = this.turrets[i];
      if (!t) return;
      const on = !Number.isNaN(aim);
      t.setEnabled(on);
      if (on) {
        const want = aim - heading;
        t.rotation.y += angleDiff(t.rotation.y, want) * Math.min(1, dt * 12);
      }
    });

    // Enemies: reuse pooled model instances per type.
    const seen = new Set<Enemy>();
    for (const e of w.enemies) {
      if (!e.alive) continue;
      seen.add(e);
      let node = this.enemyViews.get(e);
      if (!node) {
        node = this.takeEnemyNode(e.def.model);
        node.scaling.setAll(e.scale);
        this.enemyViews.set(e, node);
      }
      const y = e.isBoss ? -6 : e.radius > 15 ? -2 : 4 + ((e.uid * 7) % 9) - 4;
      node.position.set(lerp(e.px, e.x), y, lerp(e.pz, e.z));
      node.rotation.y = e.heading;
    }
    for (const [e, node] of this.enemyViews) {
      if (!seen.has(e)) {
        node.setEnabled(false);
        this.enemyPools.get(e.def.model)!.push(node);
        this.enemyViews.delete(e);
      }
    }

    for (const k in this.proj) this.proj[k].begin();
    for (const pr of w.projectiles) {
      if (!pr.alive) continue;
      const yaw = Math.atan2(pr.vx, pr.vz);
      const y = pr.kind === 'ebolt' || pr.kind === 'emissile' ? PROJ_Y - 1 : PROJ_Y;
      this.proj[pr.kind].add(lerp(pr.px, pr.x), y, lerp(pr.pz, pr.z), yaw, 1, 1, 1);
    }
    for (const k in this.proj) this.proj[k].end();

    for (const k in this.pick) this.pick[k].begin();
    const t = this.time;
    for (const k of w.pickups) {
      if (!k.alive) continue;
      const s = k.kind === 'xp' ? Math.min(2.2, 0.8 + Math.sqrt(k.value) * 0.5) : 1;
      this.pick[k.kind].add(lerp(k.px, k.x), 3 + Math.sin(t * 3 + k.x) * 1.2, lerp(k.pz, k.z), t * 2 + k.z, s, s, s);
    }
    for (const k in this.pick) this.pick[k].end();

    for (const pool of this.beamPools.values()) pool.begin();
    this.beams = this.beams.filter((b) => (b.life -= dt) > 0);
    for (const b of this.beams) {
      const dx = b.x2 - b.x1, dz = b.z2 - b.z1;
      const len = Math.hypot(dx, dz);
      const wv = b.width * (b.life / b.max);
      b.pool.add((b.x1 + b.x2) / 2, PROJ_Y, (b.z1 + b.z2) / 2, Math.atan2(dx, dz), wv, wv, len);
    }
    for (const pool of this.beamPools.values()) pool.end();

    for (const r of this.rings) {
      if (r.t >= 1) {
        r.mesh.isVisible = false;
        continue;
      }
      r.t = Math.min(1, r.t + dt / 0.45);
      const rad = r.r * (0.25 + 0.75 * r.t);
      r.mesh.isVisible = true;
      r.mesh.position.set(px, 3, pz);
      r.mesh.scaling.set(rad, 40, rad);
      r.mat.alpha = 0.9 * (1 - r.t);
    }

    // Camera: soft follow with look-ahead in the direction of travel, plus screen shake.
    const k = Math.min(1, dt * 3.5);
    this.camX += (px + p.vx * 0.9 - this.camX) * k;
    this.camZ += (pz + p.vz * 0.9 - this.camZ) * k;
    if (dt === 0) {
      this.camX = px;
      this.camZ = pz;
    }
    this.shake = Math.max(0, this.shake - dt * 6);
    const sx = (Math.random() - 0.5) * this.shake, sz = (Math.random() - 0.5) * this.shake;
    this.camera.target.set(this.camX + sx, 0, this.camZ + sz);
    this.camera.radius += (this.zoom - this.camera.radius) * Math.min(1, dt * 4);
    this.surface.update(this.camX, this.camZ, this.time);
  }

  private takeEnemyNode(model: string): TransformNode {
    let pool = this.enemyPools.get(model);
    if (!pool) {
      pool = [];
      this.enemyPools.set(model, pool);
    }
    const node = pool.pop();
    if (node) {
      node.setEnabled(true);
      return node;
    }
    return this.lib.instanceFrom(this.containers.get(model)!, model);
  }

  /** Screen-relative movement basis: W moves "up" on screen (SPEC §3.3). */
  screenBasis() {
    const a = this.camera.alpha;
    const fx = -Math.cos(a), fz = -Math.sin(a);
    return { fx, fz, rx: fz, rz: -fx };
  }

  screenToGround(x: number, y: number): { x: number; z: number } | null {
    const ray = this.scene.createPickingRay(x, y, Matrix.Identity(), this.camera);
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  render() {
    this.scene.render();
  }

  dispose() {
    this.scene.dispose();
  }

  get stats() {
    return { meshes: this.scene.getActiveMeshes().length, fps: this.engine.getFps() };
  }
}
