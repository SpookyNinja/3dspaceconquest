// Asset pipeline for Space Conquest.
//
// Reads the downloaded source packs in assets/source/ (not committed, see assets/ASSETS.md for where to get them)
// and writes optimized, web-ready files to public/assets/.
//
//   cd assets/tools && npm install && npm run build
//
// Ships:   Quaternius glTF (2048px PNG atlas embedded) -> GLB with one resized JPEG atlas, centered on the origin.
// Props:   Kenney Space Kit OBJ + MTL (flat colours)    -> GLB.
// Sprites: Kenney Particle Pack PNGs                     -> 256px PNGs.
// Sounds:  Kenney Sci-Fi Sounds OGG                       -> copied as is (already small).
// Textures: Solar System Scope / ambientCG JPGs          -> resized JPEGs.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import obj2gltf from 'obj2gltf';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { center, dedup, prune, weld } from '@gltf-transform/functions';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../source');
const OUT = path.resolve(here, '../../public/assets');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const mkdir = (p) => fs.mkdir(p, { recursive: true });
const kb = async (p) => `${Math.round((await fs.stat(p)).size / 1024)} KB`;

// ---------------------------------------------------------------- ships
// role: player = huge battlecruiser hull, fighter = common small enemy, heavy = gunship/frigate tier, boss = elite cruiser.
const SHIPS = [
  { src: 'Imperial', out: 'player_battlecruiser', colour: 'Blue', size: 1024, role: 'player' },
  { src: 'Imperial', out: 'enemy_cruiser', colour: 'Red', size: 512, role: 'boss' },
  { src: 'Striker', out: 'enemy_fighter_striker', colour: 'Red', size: 512, role: 'fighter' },
  { src: 'Dispatcher', out: 'enemy_fighter_dispatcher', colour: 'Red', size: 512, role: 'fighter' },
  { src: 'Insurgent', out: 'enemy_fighter_insurgent', colour: 'Red', size: 512, role: 'fighter' },
  { src: 'Spitfire', out: 'enemy_fighter_spitfire', colour: 'Red', size: 512, role: 'fighter' },
  { src: 'Zenith', out: 'enemy_fighter_zenith', colour: 'Red', size: 512, role: 'fighter' },
  { src: 'Bob', out: 'enemy_bomber_bob', colour: 'Red', size: 512, role: 'heavy' },
  { src: 'Challenger', out: 'enemy_gunship_challenger', colour: 'Red', size: 512, role: 'heavy' },
  { src: 'Executioner', out: 'enemy_gunship_executioner', colour: 'Red', size: 512, role: 'heavy' },
  { src: 'Omen', out: 'enemy_frigate_omen', colour: 'Red', size: 512, role: 'heavy' },
  { src: 'Pancake', out: 'enemy_frigate_pancake', colour: 'Red', size: 512, role: 'heavy' },
];

async function buildShips() {
  const dir = path.join(SRC, 'quaternius-ultimate-spaceships');
  const outDir = path.join(OUT, 'models/ships');
  await mkdir(outDir);
  const manifest = [];
  for (const s of SHIPS) {
    const doc = await io.read(path.join(dir, s.src, 'glTF', `${s.src}.gltf`));
    const png = await fs.readFile(path.join(dir, s.src, 'Textures', `${s.src}_${s.colour}.png`));
    const jpg = await sharp(png).resize(s.size, s.size).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    for (const tex of doc.getRoot().listTextures()) {
      tex.setImage(new Uint8Array(jpg)).setMimeType('image/jpeg').setName(`${s.src}_${s.colour}`);
    }
    for (const mat of doc.getRoot().listMaterials()) mat.setMetallicFactor(0.3).setRoughnessFactor(0.6);
    await doc.transform(dedup(), weld(), center({ pivot: 'center' }), prune());
    const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
    const min = pos.getMin([]), max = pos.getMax([]);
    const dims = max.map((v, i) => +(v - min[i]).toFixed(2));
    const file = path.join(outDir, `${s.out}.glb`);
    await io.write(file, doc);
    manifest.push({ id: s.out, file: `models/ships/${s.out}.glb`, role: s.role, source: s.src, colour: s.colour, size: dims });
    console.log('ship', s.out, dims.join(' x '), await kb(file));
  }
  return manifest;
}

// ---------------------------------------------------------------- props
const PROPS = [
  'meteorFull', 'meteorFullRound', 'meteorHalf', 'rocks', 'rocksOre', 'rocksTall', 'rocksSmallOre', 'crater', 'craterLarge',
  'station', 'stationLarge', 'satelliteDish', 'satelliteDishLarge', 'satelliteDishAntenna', 'portal', 'barrel', 'barrelLarge',
  'spaceCraft1', 'spaceCraft2', 'spaceCraft3', 'spaceCraft4', 'spaceCraft5', 'spaceCraft6',
];

async function buildProps() {
  const dir = path.join(SRC, 'kenney-space-kit', 'Models');
  const outDir = path.join(OUT, 'models/props');
  await mkdir(outDir);
  const manifest = [];
  for (const name of PROPS) {
    const glb = await obj2gltf(path.join(dir, `${name}.obj`), { binary: true });
    const doc = await io.readBinary(new Uint8Array(glb));
    await doc.transform(dedup(), weld(), prune());
    const file = path.join(outDir, `${name}.glb`);
    await io.write(file, doc);
    manifest.push({ id: name, file: `models/props/${name}.glb` });
    console.log('prop', name, await kb(file));
  }
  return manifest;
}

// ---------------------------------------------------------------- particle sprites
const SPRITES = [
  'circle_05', 'fire_01', 'fire_02', 'flame_03', 'flame_05', 'flare_01', 'light_01', 'light_03', 'magic_02', 'muzzle_01',
  'muzzle_02', 'muzzle_04', 'scorch_02', 'smoke_01', 'smoke_04', 'smoke_07', 'spark_01', 'spark_04', 'spark_06', 'star_04',
  'star_07', 'trace_01', 'trace_04', 'twirl_02',
];

async function buildSprites() {
  const dir = path.join(SRC, 'kenney-particle-pack', 'PNG (Transparent)');
  const outDir = path.join(OUT, 'sprites/particles');
  await mkdir(outDir);
  for (const name of SPRITES) {
    const file = path.join(outDir, `${name}.png`);
    await sharp(path.join(dir, `${name}.png`)).resize(256, 256).png({ compressionLevel: 9, palette: false }).toFile(file);
  }
  console.log('sprites', SPRITES.length);
  return SPRITES.map((id) => ({ id, file: `sprites/particles/${id}.png` }));
}

// ---------------------------------------------------------------- sounds
const SOUNDS = [
  'laser_small_000', 'laser_small_002', 'laser_large_000', 'laser_large_002', 'laser_retro_001', 'explosion_crunch_000',
  'explosion_crunch_002', 'low_frequency_explosion_000', 'low_frequency_explosion_001', 'impact_metal_000', 'impact_metal_002',
  'force_field_000', 'force_field_002', 'thruster_fire_000', 'space_engine_large_000', 'space_engine_low_000',
  'computer_noise_000', 'door_open_000',
];

async function buildSounds() {
  const dir = path.join(SRC, 'kenney-scifi-sounds');
  const outDir = path.join(OUT, 'audio/sfx');
  await mkdir(outDir);
  for (const name of SOUNDS) await fs.copyFile(path.join(dir, `${name}.ogg`), path.join(outDir, `${name}.ogg`));
  console.log('sounds', SOUNDS.length);
  return SOUNDS.map((id) => ({ id, file: `audio/sfx/${id}.ogg` }));
}

// ---------------------------------------------------------------- textures
const TEXTURES = [
  // [source file, output path, max width]
  ['solarsystemscope/8k_stars_milky_way.jpg', 'textures/sky/stars_milky_way_4k.jpg', 4096],
  ['solarsystemscope/2k_sun.jpg', 'textures/planets/sun_2k.jpg', 2048],
  ['solarsystemscope/2k_earth_clouds.jpg', 'textures/planets/clouds_2k.jpg', 2048],
  ['solarsystemscope/2k_moon.jpg', 'textures/planets/moon_2k.jpg', 2048],
  ['ambientcg/Facade018A/Facade018A_1K-JPG_Color.jpg', 'textures/surface/city/facade018a_color.jpg', 1024],
  ['ambientcg/Facade018A/Facade018A_1K-JPG_Emission.jpg', 'textures/surface/city/facade018a_emission.jpg', 1024],
  ['ambientcg/Facade018A/Facade018A_1K-JPG_NormalGL.jpg', 'textures/surface/city/facade018a_normal.jpg', 1024],
  ['ambientcg/Facade006/Facade006_1K-JPG_Color.jpg', 'textures/surface/city/facade006_color.jpg', 1024],
  ['ambientcg/Facade006/Facade006_1K-JPG_NormalGL.jpg', 'textures/surface/city/facade006_normal.jpg', 1024],
  ['ambientcg/Foam003/Foam003_1K-JPG_Color.jpg', 'textures/surface/ocean/foam003_color.jpg', 1024],
];

async function buildTextures() {
  for (const [src, out, w] of TEXTURES) {
    const file = path.join(OUT, out);
    await mkdir(path.dirname(file));
    await sharp(path.join(SRC, src)).resize({ width: w, withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toFile(file);
    console.log('texture', out, await kb(file));
  }
  return TEXTURES.map(([, file]) => ({ id: path.basename(file, '.jpg'), file }));
}

const manifest = {
  ships: await buildShips(),
  props: await buildProps(),
  sprites: await buildSprites(),
  sounds: await buildSounds(),
  textures: await buildTextures(),
};
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote', path.join(OUT, 'manifest.json'));
