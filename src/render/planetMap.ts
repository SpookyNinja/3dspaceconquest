// Planet map: a rotating globe with its zones. Picking a zone and launching zooms down onto the surface (Andre, 2026-11-04).
import {
  Animation,
  ArcRotateCamera,
  Color3,
  CubicEase,
  DirectionalLight,
  EasingFunction,
  Engine,
  FresnelParameters,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  Color4,
  VertexBuffer,
} from '@babylonjs/core';
import { tex, emissiveMat } from './common';
import { FACTIONS, FactionId, PLANETS, PlanetDef, ZoneDef } from '../game/data';

const R = 100;

export type ZoneState = 'captured' | 'attackable' | 'locked';

export class PlanetMap {
  readonly scene: Scene;
  private camera: ArcRotateCamera;
  private globes = new Map<string, { root: TransformNode; body: Mesh; clouds: Mesh; terr: Mesh }>();
  private markers = new Map<string, { mesh: Mesh; mat: StandardMaterial; ring: Mesh; zone: ZoneDef }>();
  private current: PlanetDef = PLANETS[0];
  selected: string | null = null;
  onPick: (zoneId: string) => void = () => {};
  private t = 0;
  private flying = false;
  private glow: GlowLayer;

  constructor(engine: Engine) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.005, 0.008, 0.02, 1);
    this.camera = new ArcRotateCamera('mapCam', -Math.PI / 2, 1.2, 330, Vector3.Zero(), scene);
    this.camera.minZ = 0.5;
    this.camera.maxZ = 30000;
    this.camera.lowerRadiusLimit = 180;
    this.camera.upperRadiusLimit = 600;
    this.camera.wheelPrecision = 3;
    this.camera.attachControl(engine.getRenderingCanvas()!, true);
    this.camera.panningSensibility = 0;
    const sun = new DirectionalLight('sun', new Vector3(-1, -0.3, 0.6), scene);
    sun.intensity = 2.2;
    const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
    fill.intensity = 0.25;
    fill.groundColor = new Color3(0.05, 0.07, 0.12);
    this.glow = new GlowLayer('glow', scene);
    this.glow.intensity = 0.7;

    const sky = MeshBuilder.CreateSphere('sky', { diameter: 20000, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
    const skyMat = new StandardMaterial('skyMat', scene);
    skyMat.emissiveTexture = tex(scene, 'textures/sky/stars_milky_way_4k.jpg');
    skyMat.disableLighting = true;
    sky.material = skyMat;
    sky.infiniteDistance = true;
    sky.isPickable = false;

    for (const p of PLANETS) this.makeGlobe(p);
    this.showPlanet(PLANETS[0].id);

    scene.onPointerObservable.add((info) => {
      if (info.type !== 1 /* POINTERDOWN */ || this.flying) return;
      const hit = scene.pick(scene.pointerX, scene.pointerY, (m) => m.metadata?.zoneId);
      if (hit?.pickedMesh?.metadata?.zoneId) this.onPick(hit.pickedMesh.metadata.zoneId);
    });
  }

  private makeGlobe(p: PlanetDef) {
    const scene = this.scene;
    const root = new TransformNode(p.id, scene);
    const body = MeshBuilder.CreateSphere(p.id + 'Body', { diameter: R * 2, segments: 64 }, scene);
    body.parent = root;
    const m = new StandardMaterial(p.id + 'Mat', scene);
    if (p.id === 'megacity') {
      m.diffuseTexture = tex(scene, 'textures/planets/megacity_albedo.jpg');
      m.emissiveTexture = tex(scene, 'textures/planets/megacity_emissive.jpg');
      m.specularColor = new Color3(0.05, 0.05, 0.05);
    } else {
      m.diffuseTexture = tex(scene, 'textures/planets/ocean_albedo.jpg');
      m.specularTexture = tex(scene, 'textures/planets/ocean_specular.jpg');
      m.specularPower = 64;
      m.specularColor = new Color3(0.35, 0.35, 0.35);
    }
    body.material = m;
    const clouds = MeshBuilder.CreateSphere(p.id + 'Clouds', { diameter: R * 2.025, segments: 48 }, scene);
    clouds.parent = root;
    const cm = new StandardMaterial(p.id + 'CloudMat', scene);
    const ct = tex(scene, 'textures/planets/clouds_2k.jpg');
    ct.getAlphaFromRGB = true;
    cm.opacityTexture = ct;
    cm.specularColor = Color3.Black();
    cm.alpha = p.id === 'ocean' ? 0.5 : 0.18;
    clouds.material = cm;
    const atm = MeshBuilder.CreateSphere(p.id + 'Atm', { diameter: R * 2.12, segments: 48 }, scene);
    atm.parent = root;
    const am = new StandardMaterial(p.id + 'AtmMat', scene);
    am.emissiveColor = p.id === 'ocean' ? new Color3(0.4, 0.7, 1) : new Color3(0.6, 0.7, 0.9);
    am.alpha = 0.14;
    am.disableLighting = true;
    am.emissiveFresnelParameters = new FresnelParameters();
    am.emissiveFresnelParameters.bias = 0.2;
    am.emissiveFresnelParameters.power = 3;
    am.emissiveFresnelParameters.leftColor = Color3.White();
    am.emissiveFresnelParameters.rightColor = Color3.Black();
    atm.material = am;
    // Territory overlay: every vertex takes the colour of the nearest zone's holder, with bright borders (Voronoi on the sphere).
    const terr = MeshBuilder.CreateSphere(p.id + 'Terr', { diameter: R * 2.032, segments: 180, updatable: true }, scene);
    terr.parent = root;
    const tm = new StandardMaterial(p.id + 'TerrMat', scene);
    tm.disableLighting = true;
    tm.emissiveColor = Color3.White(); // vertex colours multiply the base colour, emissive white makes them show as-is
    tm.diffuseColor = Color3.Black();
    tm.specularColor = Color3.Black();
    tm.backFaceCulling = true;
    terr.material = tm;
    terr.hasVertexAlpha = true;
    this.glow.addExcludedMesh(terr);
    tm.alpha = 0.999; // forces the transparent pass so vertex alpha is used
    [body, clouds, atm, terr].forEach((x) => (x.isPickable = false));

    for (const z of p.zones) {
      const pos = latLon(z.lat, z.lon, R * 1.005);
      const mat = emissiveMat(scene, 'zm' + z.id, [1, 0.5, 0.1]);
      const mesh = MeshBuilder.CreateDisc('zone' + z.id, { radius: 7, tessellation: 6 }, scene);
      mesh.material = mat;
      mesh.parent = root;
      mesh.position = pos;
      mesh.lookAt(root.position); // disc front (-Z) faces outward
      mesh.metadata = { zoneId: z.id };
      const ring = MeshBuilder.CreateTorus('zr' + z.id, { diameter: 18, thickness: 0.8, tessellation: 32 }, scene);
      ring.material = mat;
      ring.parent = mesh;
      ring.rotation.x = Math.PI / 2;
      ring.isPickable = false;
      this.markers.set(z.id, { mesh, mat, ring, zone: z });
    }
    this.globes.set(p.id, { root, body, clouds, terr });
  }

  showPlanet(id: string) {
    this.current = PLANETS.find((p) => p.id === id)!;
    for (const [pid, g] of this.globes) g.root.setEnabled(pid === id);
  }

  setZoneStates(states: Record<string, ZoneState>) {
    for (const [id, m] of this.markers) {
      const s = states[id] ?? 'locked';
      const c = s === 'captured' ? [0.3, 0.7, 1.6] : s === 'attackable' ? [1.6, 0.6, 0.15] : [0.5, 0.12, 0.12];
      m.mat.emissiveColor = new Color3(c[0], c[1], c[2]);
      m.mesh.metadata.state = s;
    }
    for (const p of PLANETS) this.paintTerritory(p, states);
  }

  private paintTerritory(p: PlanetDef, states: Record<string, ZoneState>) {
    const terr = this.globes.get(p.id)!.terr;
    const seeds = [
      ...p.zones.map((z) => ({ v: latLon(z.lat, z.lon, 1), owner: states[z.id] === 'captured' ? ('alliance' as FactionId) : z.owner, front: states[z.id] === 'attackable' })),
      ...p.regions.map((rg) => ({ v: latLon(rg.lat, rg.lon, 1), owner: rg.owner, front: false })),
    ];
    const pos = terr.getVerticesData(VertexBuffer.PositionKind)!;
    const n = pos.length / 3;
    const colors = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const l = Math.hypot(x, y, z);
      let b1 = -2, b2 = -2, best = 0, second = 0;
      for (let k = 0; k < seeds.length; k++) {
        const d = (x * seeds[k].v.x + y * seeds[k].v.y + z * seeds[k].v.z) / l;
        if (d > b1) { b2 = b1; second = best; b1 = d; best = k; }
        else if (d > b2) { b2 = d; second = k; }
      }
      const s1 = seeds[best], s2 = seeds[second];
      const gap = Math.acos(Math.min(1, b2)) - Math.acos(Math.min(1, b1)); // angular distance to the border
      const c = FACTIONS[s1.owner].color;
      const factionBorder = s1.owner !== s2.owner;
      let a = 0.3, k = 0.75;
      if (gap < 0.012) { a = factionBorder ? 0.95 : 0.35; k = factionBorder ? 1.25 : 1.0; }
      else if (factionBorder && gap < 0.05) { a = 0.3 + (0.05 - gap) * 8; k = 0.9; }
      if (s1.front) { a += 0.12 + (gap < 0.02 ? 0.35 : 0); }
      const fc = s1.front && gap < 0.02 ? [1.4, 0.75, 0.2] : c;
      colors[i * 4] = fc[0] * k;
      colors[i * 4 + 1] = fc[1] * k;
      colors[i * 4 + 2] = fc[2] * k;
      colors[i * 4 + 3] = Math.min(1, a);
    }
    terr.setVerticesData(VertexBuffer.ColorKind, colors, true, 4);
  }

  /** Rotate the globe so a zone faces the camera. */
  focusZone(zoneId: string) {
    this.selected = zoneId;
    const m = this.markers.get(zoneId);
    if (!m) return;
    this.targetSpin = (m.zone.lon * Math.PI) / 180;
    this.camera.beta = Math.PI / 2 - (m.zone.lat * Math.PI) / 180 * 0.8;
  }
  private targetSpin: number | null = null;
  private spin = 0;

  update(dt: number) {
    this.t += dt;
    const g = this.globes.get(this.current.id)!;
    if (this.targetSpin !== null) {
      const d = this.targetSpin - this.spin;
      this.spin += d * Math.min(1, dt * 3);
    } else this.spin += dt * 0.05;
    g.root.rotation.y = this.spin;
    g.clouds.rotation.y = this.t * 0.01;
    for (const [id, m] of this.markers) {
      const s = 1 + (id === this.selected ? 0.35 + Math.sin(this.t * 5) * 0.15 : m.mesh.metadata.state === 'attackable' ? Math.sin(this.t * 3) * 0.12 : 0);
      m.mesh.scaling.setAll(s);
    }
  }

  /** Camera dives toward the selected zone; resolves when the screen should cut to the mission. */
  descend(): Promise<void> {
    const m = this.selected ? this.markers.get(this.selected) : null;
    if (!m) return Promise.resolve();
    this.flying = true;
    this.camera.detachControl();
    this.camera.lowerRadiusLimit = 1;
    const world = m.mesh.getAbsolutePosition().clone();
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEIN);
    const fps = 60;
    Animation.CreateAndStartAnimation('dive', this.camera, 'radius', fps, 80, this.camera.radius, R * 1.06, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    Animation.CreateAndStartAnimation('aim', this.camera, 'target', fps, 60, this.camera.target.clone(), world.scale(0.9), Animation.ANIMATIONLOOPMODE_CONSTANT);
    return new Promise((res) => setTimeout(res, 1350));
  }

  /** Restore the orbit camera after returning from a mission. */
  reset() {
    this.flying = false;
    this.scene.stopAnimation(this.camera);
    this.camera.lowerRadiusLimit = 180;
    this.camera.radius = 330;
    this.camera.target = Vector3.Zero();
    this.camera.attachControl(this.scene.getEngine().getRenderingCanvas()!, true);
  }

  render() {
    this.scene.render();
  }

  dispose() {
    this.scene.dispose();
  }
}

function latLon(lat: number, lon: number, r: number): Vector3 {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return new Vector3(Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r, -Math.cos(la) * Math.cos(lo) * r);
}
