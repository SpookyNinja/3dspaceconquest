// The planet surface beneath the battle (SPEC §5.2). Missions are fought low over the zone itself:
// a night-time megacity or an open ocean. Everything here is decoration: it never collides.
import {
  Color3,
  Color4,
  DynamicTexture,
  Matrix,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  Vector4,
} from '@babylonjs/core';
import { ModelLibrary, ThinPool, tex, wrap, ASSET_BASE } from './common';
import { Rng } from '../game/rng';

export interface Surface {
  update(focusX: number, focusZ: number, t: number): void;
}

const TILE = 1800; // repeating world tile for decorations

export function createSurface(kind: 'megacity' | 'ocean', scene: Scene, lib: ModelLibrary, seed: number): Surface {
  return kind === 'megacity' ? createCity(scene, seed) : createOcean(scene, lib, seed);
}

// ---------------- Megacity ----------------

const CITY_Y = -460;
const BLOCK = 100; // street grid pitch
const STREET = 22;

function streetTexture(scene: Scene): DynamicTexture {
  const size = 1024;
  const dt = new DynamicTexture('streets', { width: size, height: size }, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const blocks = 4; // texture covers 4x4 blocks
  const px = size / blocks;
  const st = (STREET / BLOCK) * px;
  ctx.fillStyle = '#05070b';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < blocks; i++) {
    for (let j = 0; j < blocks; j++) {
      ctx.fillStyle = (i + j) % 3 ? '#0d1016' : '#10141b';
      ctx.fillRect(i * px + st / 2, j * px + st / 2, px - st, px - st);
    }
  }
  // Street lights and lane markings
  for (let i = 0; i < blocks; i++) {
    const c = i * px;
    ctx.fillStyle = '#ffb35c';
    for (let k = 0; k < size; k += 14) {
      ctx.fillRect(c - 2, k, 4, 4);
      ctx.fillRect(k, c - 2, 4, 4);
    }
    ctx.fillStyle = 'rgba(120,190,255,0.55)';
    ctx.fillRect(c - st / 2 + 2, 0, 2, size);
    ctx.fillRect(c + st / 2 - 4, 0, 2, size);
    ctx.fillRect(0, c - st / 2 + 2, size, 2);
    ctx.fillRect(0, c + st / 2 - 4, size, 2);
  }
  dt.update();
  dt.wrapU = dt.wrapV = Texture.WRAP_ADDRESSMODE;
  return dt;
}

function buildingMesh(scene: Scene, name: string, w: number, h: number, d: number, mat: StandardMaterial): Mesh {
  const tw = 12; // world units per texture repeat
  const side = (len: number) => new Vector4(0, 0, len / tw, h / tw);
  const roof = new Vector4(0.02, 0.02, 0.03, 0.03);
  const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d, faceUV: [side(w), side(w), side(d), side(d), roof, roof], wrap: true }, scene);
  m.bakeTransformIntoVertices(Matrix.Translation(0, h / 2, 0));
  m.material = mat;
  return m;
}


function createCity(scene: Scene, seed: number): Surface {
  const rng = new Rng(seed);
  scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0.04, 0.05, 0.1);
  scene.fogStart = 380;
  scene.fogEnd = 1350;

  // Street grid ground, moved in whole texture tiles so it stays locked to the world.
  const streets = streetTexture(scene);
  const groundSize = 3600;
  const ground = MeshBuilder.CreateGround('cityGround', { width: groundSize, height: groundSize }, scene);
  ground.position.y = CITY_Y;
  const gm = new StandardMaterial('cityGroundMat', scene);
  gm.diffuseTexture = streets;
  gm.emissiveTexture = streets;
  gm.specularColor = Color3.Black();
  streets.uScale = streets.vScale = groundSize / (BLOCK * 4);
  ground.material = gm;
  ground.isPickable = false;

  // Building materials
  const glass = new StandardMaterial('facadeA', scene);
  glass.diffuseTexture = tex(scene, 'textures/surface/city/facade018a_color.jpg');
  glass.emissiveTexture = tex(scene, 'textures/surface/city/facade018a_emission.jpg');
  glass.diffuseColor = new Color3(0.16, 0.18, 0.25);
  glass.emissiveColor = new Color3(0.55, 0.45, 0.32);
  glass.specularColor = new Color3(0.1, 0.1, 0.15);
  const concrete = new StandardMaterial('facadeB', scene);
  concrete.diffuseTexture = tex(scene, 'textures/surface/city/facade006_color.jpg');
  concrete.bumpTexture = tex(scene, 'textures/surface/city/facade006_normal.jpg');
  concrete.diffuseColor = new Color3(0.2, 0.21, 0.26);
  concrete.emissiveColor = new Color3(0.03, 0.035, 0.05);
  concrete.specularColor = Color3.Black();

  const kinds = [
    { mesh: buildingMesh(scene, 'tower', 26, 130, 26, glass), weight: 3 },
    { mesh: buildingMesh(scene, 'block', 40, 60, 40, glass), weight: 3 },
    { mesh: buildingMesh(scene, 'slab', 60, 35, 34, concrete), weight: 3 },
    { mesh: buildingMesh(scene, 'spire', 16, 200, 16, glass), weight: 1 },
  ];
  type B = { x: number; z: number; yaw: number; s: number; h: number; k: number };
  const buildings: B[] = [];
  const n = TILE / BLOCK;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // 2x2 lots per block
      for (let q = 0; q < 4; q++) {
        if (rng.chance(0.35)) continue;
        const lot = (BLOCK - STREET) / 2;
        const x = i * BLOCK + STREET / 2 + (q % 2) * lot + lot / 2;
        const z = j * BLOCK + STREET / 2 + Math.floor(q / 2) * lot + lot / 2;
        const r = rng.next() * 10;
        const k = r < 3 ? 0 : r < 6 ? 1 : r < 9 ? 2 : 3;
        // Taller near "downtown" cores so the skyline has shape.
        const core = Math.cos((i / n) * Math.PI * 2) + Math.cos((j / n) * Math.PI * 2);
        buildings.push({ x, z, yaw: rng.chance(0.5) ? 0 : Math.PI / 2, s: rng.range(0.7, 1.0), h: rng.range(0.35, 1.0) * (1 + core * 0.25), k });
      }
    }
  }
  const pools = kinds.map((k) => new ThinPool(k.mesh, 2048));

  // Hover traffic: lines of lights along the streets
  const carMat = new StandardMaterial('cars', scene);
  carMat.emissiveColor = new Color3(1, 0.9, 0.7);
  carMat.disableLighting = true;
  const carMesh = MeshBuilder.CreateBox('car', { width: 2.5, height: 1.5, depth: 6 }, scene);
  carMesh.material = carMat;
  const cars = new ThinPool(carMesh, 1024);
  const carData: { lane: number; along: number; speed: number; axis: 0 | 1; y: number }[] = [];
  for (let i = 0; i < 500; i++) {
    carData.push({ lane: rng.int(0, n - 1) * BLOCK + rng.range(-6, 6), along: rng.range(0, TILE), speed: rng.range(30, 70) * (rng.chance(0.5) ? 1 : -1), axis: rng.chance(0.5) ? 0 : 1, y: rng.chance(0.3) ? rng.range(40, 90) : 3 });
  }

  // Fires and smoke where the city is under attack.
  const fires: { x: number; z: number; node: TransformNode }[] = [];
  for (let i = 0; i < 6; i++) {
    const b = buildings[rng.int(0, buildings.length - 1)];
    const node = new TransformNode('fire', scene);
    const top = CITY_Y + (b.k === 0 ? 130 : b.k === 1 ? 60 : b.k === 2 ? 35 : 200) * b.h;
    node.position.y = top;
    const smoke = new ParticleSystem('smoke', 220, scene);
    smoke.particleTexture = new Texture(ASSET_BASE + 'sprites/particles/smoke_04.png', scene);
    smoke.emitter = node as unknown as Vector3; // TransformNode emitters are supported
    smoke.minEmitBox = new Vector3(-10, 0, -10);
    smoke.maxEmitBox = new Vector3(10, 0, 10);
    smoke.color1 = new Color4(0.25, 0.22, 0.22, 0.5);
    smoke.color2 = new Color4(0.12, 0.12, 0.14, 0.4);
    smoke.colorDead = new Color4(0, 0, 0, 0);
    smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    smoke.minSize = 20;
    smoke.maxSize = 55;
    smoke.minLifeTime = 4;
    smoke.maxLifeTime = 7;
    smoke.emitRate = 22;
    smoke.direction1 = new Vector3(-0.2, 1, 0.1);
    smoke.direction2 = new Vector3(0.3, 1, 0.3);
    smoke.minEmitPower = 10;
    smoke.maxEmitPower = 18;
    smoke.start();
    const fire = new ParticleSystem('fire', 120, scene);
    fire.particleTexture = new Texture(ASSET_BASE + 'sprites/particles/fire_01.png', scene);
    fire.emitter = node as unknown as Vector3;
    fire.minEmitBox = new Vector3(-8, 0, -8);
    fire.maxEmitBox = new Vector3(8, 4, 8);
    fire.color1 = new Color4(1, 0.6, 0.2, 1);
    fire.color2 = new Color4(1, 0.3, 0.05, 1);
    fire.colorDead = new Color4(0.2, 0, 0, 0);
    fire.minSize = 8;
    fire.maxSize = 18;
    fire.minLifeTime = 0.4;
    fire.maxLifeTime = 0.9;
    fire.emitRate = 70;
    fire.blendMode = ParticleSystem.BLENDMODE_ADD;
    fire.direction1 = new Vector3(0, 1, 0);
    fire.direction2 = new Vector3(0, 1, 0);
    fire.minEmitPower = 6;
    fire.maxEmitPower = 14;
    fire.start();
    fires.push({ x: b.x, z: b.z, node });
  }

  const clouds = cloudLayer(scene, -120, 0.12, new Color3(0.3, 0.35, 0.45));

  return {
    update(fx, fz, t) {
      // Snap the ground to whole texture repeats so streets stay world-locked.
      const g = BLOCK * 4;
      ground.position.x = Math.round(fx / g) * g;
      ground.position.z = Math.round(fz / g) * g;
      pools.forEach((p) => p.begin());
      for (const b of buildings) {
        const x = wrap(b.x, fx, TILE), z = wrap(b.z, fz, TILE);
        if (Math.abs(x - fx) > 1100 || Math.abs(z - fz) > 1000) continue;
        pools[b.k].add(x, CITY_Y, z, b.yaw, b.s, b.h, b.s);
      }
      pools.forEach((p) => p.end());
      cars.begin();
      for (const c of carData) {
        const along = ((c.along + c.speed * t) % TILE + TILE) % TILE;
        const lx = c.axis ? c.lane : along, lz = c.axis ? along : c.lane;
        const x = wrap(lx, fx, TILE), z = wrap(lz, fz, TILE);
        cars.add(x, CITY_Y + c.y, z, c.axis ? 0 : Math.PI / 2, 1, 1, 1);
      }
      cars.end();
      for (const f of fires) {
        f.node.position.x = wrap(f.x, fx, TILE);
        f.node.position.z = wrap(f.z, fz, TILE);
      }
      clouds(fx, fz, t);
    },
  };
}

/** Semi-transparent scrolling cloud sheet between the ships and the ground, which sells the altitude. */
function cloudLayer(scene: Scene, y: number, alpha: number, color: Color3) {
  const size = 3000;
  const plane = MeshBuilder.CreateGround('clouds', { width: size, height: size }, scene);
  plane.position.y = y;
  const m = new StandardMaterial('cloudMat', scene);
  const t = tex(scene, 'textures/planets/clouds_2k.jpg');
  t.uScale = 1.4;
  t.vScale = 0.7; // the cloud map is 2:1, keep its aspect
  m.opacityTexture = t;
  t.getAlphaFromRGB = true;
  m.diffuseColor = color;
  m.emissiveColor = color.scale(0.6);
  m.specularColor = Color3.Black();
  m.alpha = alpha;
  m.backFaceCulling = false;
  m.fogEnabled = false;
  plane.material = m;
  plane.isPickable = false;
  return (fx: number, fz: number, time: number) => {
    plane.position.x = fx;
    plane.position.z = fz;
    // Texture offset keeps clouds world-locked (plus a slow drift) while the plane follows the camera.
    t.uOffset = (fx / size) * 1.4 + time * 0.002;
    t.vOffset = 0.15 + (fz / size) * 0.7;
  };
}

// ---------------- Ocean ----------------

function swellTexture(scene: Scene): DynamicTexture {
  const n = 256;
  const dt = new DynamicTexture('swell', { width: n, height: n }, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(n, n);
  const waves = [
    [3, 1, 0.0], [1, 4, 1.3], [5, -2, 2.1], [-4, 3, 0.7], [7, 5, 2.9], [2, -7, 1.9],
  ];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0;
      waves.forEach(([a, b, ph], i) => (v += Math.sin(((a * x + b * y) / n) * Math.PI * 2 + ph) / (1 + i * 0.35)));
      const t = Math.max(0, Math.min(1, 0.5 + v * 0.16));
      const o = (y * n + x) * 4;
      img.data[o] = 20 + t * 40;
      img.data[o + 1] = 70 + t * 70;
      img.data[o + 2] = 110 + t * 80;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  dt.update();
  dt.wrapU = dt.wrapV = Texture.WRAP_ADDRESSMODE;
  return dt;
}

const SEA_Y = -260;

function createOcean(scene: Scene, lib: ModelLibrary, seed: number): Surface {
  const rng = new Rng(seed);
  scene.clearColor = new Color4(0.45, 0.62, 0.78, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0.5, 0.66, 0.8);
  scene.fogStart = 700;
  scene.fogEnd = 2200;

  const size = 4000;
  const water = MeshBuilder.CreateGround('sea', { width: size, height: size, subdivisions: 1 }, scene);
  water.position.y = SEA_Y;
  const wm = new StandardMaterial('seaMat', scene);
  wm.diffuseColor = new Color3(0.03, 0.2, 0.32);
  wm.specularColor = new Color3(0.25, 0.3, 0.35);
  wm.specularPower = 24;
  wm.emissiveColor = new Color3(0.0, 0.04, 0.07);
  // Procedural swell: a tileable sum of sines, so the water has soft light and dark bands.
  const foamTex = swellTexture(scene);
  foamTex.uScale = foamTex.vScale = size / 600;
  wm.diffuseTexture = foamTex;
  wm.diffuseColor = new Color3(0.26, 0.6, 0.85);
  water.material = wm;
  water.isPickable = false;

  // Second foam layer drifting the other way: cheap animated waves.
  const foam = MeshBuilder.CreateGround('foam', { width: size, height: size }, scene);
  foam.position.y = SEA_Y + 1;
  const fm = new StandardMaterial('foamMat', scene);
  const ft = tex(scene, 'textures/surface/ocean/foam003_color.jpg');
  ft.uScale = ft.vScale = size / 300;
  ft.getAlphaFromRGB = true;
  fm.opacityTexture = ft;
  fm.diffuseColor = new Color3(0.85, 0.95, 1);
  fm.emissiveColor = new Color3(0.25, 0.35, 0.4);
  fm.specularColor = Color3.Black();
  fm.alpha = 0.28;
  foam.material = fm;
  foam.isPickable = false;

  // Islands, platforms and naval wrecks, wrapped like the city blocks.
  type Deco = { x: number; z: number; node: TransformNode };
  const decos: Deco[] = [];
  const spawn = async (model: string, scale: number, sink: number, tilt: number, flat = 1) => {
    const node = await lib.instance(model);
    node.scaling.set(scale, scale * flat, scale);
    node.rotation.y = rng.range(0, Math.PI * 2);
    node.rotation.z = tilt;
    node.position.y = SEA_Y - sink;
    const d = { x: rng.range(0, TILE), z: rng.range(0, TILE), node };
    decos.push(d);
  };
  const islandModels = ['props/rocks', 'props/rocksTall', 'props/rocksOre', 'props/meteorHalf'];
  for (let i = 0; i < 14; i++) void spawn(rng.pick(islandModels), rng.range(7, 20), rng.range(1, 4), 0, 0.5);
  for (let i = 0; i < 5; i++) void spawn(rng.chance(0.5) ? 'props/stationLarge' : 'props/station', rng.range(4, 6), 0, 0);
  for (let i = 0; i < 3; i++) void spawn('ships/enemy_cruiser', rng.range(4, 6), 6, rng.range(-0.35, 0.35));

  const clouds = cloudLayer(scene, -110, 0.3, new Color3(1, 1, 1));

  return {
    update(fx, fz, t) {
      const g = size / 600;
      const step = size / g;
      water.position.x = Math.round(fx / step) * step;
      water.position.z = Math.round(fz / step) * step;
      foam.position.x = fx;
      foam.position.z = fz;
      ft.uOffset = (fx / size) * (size / 300) + t * 0.01;
      ft.vOffset = (fz / size) * (size / 300) + t * 0.006;
      foamTex.uOffset = -t * 0.004;
      for (const d of decos) {
        d.node.position.x = wrap(d.x, fx, TILE);
        d.node.position.z = wrap(d.z, fz, TILE);
      }
      clouds(fx, fz, t);
    },
  };
}
