// Solar system screen (SPEC §5.3, Andre 2026-11-04): a sun in the middle with the playable planets orbiting it.
// Clicking a planet flies the camera to it and opens that planet's zone map.
import {
  Animation,
  ArcRotateCamera,
  Color3,
  Color4,
  CubicEase,
  EasingFunction,
  Engine,
  FresnelParameters,
  GlowLayer,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { tex } from './common';
import { PLANETS, PlanetDef, PlanetId } from '../game/data';

const CAM = { alpha: -Math.PI / 2 + 0.25, beta: 1.08, radius: 760 };

interface Body {
  def: PlanetDef;
  root: TransformNode;
  body: Mesh;
  clouds: Mesh;
  ring: Mesh;
  angle: number;
}

export class SolarSystem {
  readonly scene: Scene;
  private camera: ArcRotateCamera;
  private bodies = new Map<PlanetId, Body>();
  private sun: Mesh;
  private t = 0;
  private flying = false;
  hover: PlanetId | null = null;
  /** Pixels to shift the view right so the system centres in the space beside the left panel. */
  screenShift = 0;
  onPick: (planet: PlanetId) => void = () => {};

  constructor(engine: Engine) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.004, 0.006, 0.015, 1);
    const cam = (this.camera = new ArcRotateCamera('sysCam', CAM.alpha, CAM.beta, CAM.radius, Vector3.Zero(), scene));
    cam.minZ = 1;
    cam.maxZ = 40000;
    cam.lowerRadiusLimit = 420;
    cam.upperRadiusLimit = 1200;
    cam.lowerBetaLimit = 0.45;
    cam.upperBetaLimit = 1.4;
    cam.wheelPrecision = 1.5;
    cam.panningSensibility = 0;
    cam.attachControl(engine.getRenderingCanvas()!, true);

    const light = new PointLight('sunLight', Vector3.Zero(), scene);
    light.intensity = 1.6;
    light.diffuse = new Color3(1, 0.93, 0.82);
    const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
    fill.intensity = 0.12;
    fill.groundColor = new Color3(0.04, 0.05, 0.1);
    const glow = new GlowLayer('sysGlow', scene, { blurKernelSize: 64 });
    glow.intensity = 1.1;

    const sky = MeshBuilder.CreateSphere('sky', { diameter: 30000, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
    const skyMat = new StandardMaterial('skyMat', scene);
    skyMat.emissiveTexture = tex(scene, 'textures/sky/stars_milky_way_4k.jpg');
    skyMat.disableLighting = true;
    sky.material = skyMat;
    sky.infiniteDistance = true;
    sky.isPickable = false;

    // The sun: textured, self-lit, with a soft corona from the glow layer.
    const sun = (this.sun = MeshBuilder.CreateSphere('sun', { diameter: 120, segments: 48 }, scene));
    const sm = new StandardMaterial('sunMat', scene);
    sm.emissiveTexture = tex(scene, 'textures/planets/sun_2k.jpg');
    sm.emissiveColor = new Color3(1, 0.75, 0.4);
    sm.diffuseColor = Color3.Black();
    sm.specularColor = Color3.Black();
    sm.disableLighting = true;
    sun.material = sm;
    sun.isPickable = false;
    glow.addIncludedOnlyMesh(sun);
    const corona = MeshBuilder.CreateSphere('corona', { diameter: 170, segments: 32 }, scene);
    const cm = new StandardMaterial('coronaMat', scene);
    cm.emissiveColor = new Color3(1, 0.6, 0.25);
    cm.disableLighting = true;
    cm.alpha = 0.35;
    cm.emissiveFresnelParameters = new FresnelParameters();
    cm.emissiveFresnelParameters.bias = 0.1;
    cm.emissiveFresnelParameters.power = 2.5;
    cm.emissiveFresnelParameters.leftColor = Color3.Black();
    cm.emissiveFresnelParameters.rightColor = new Color3(1, 0.7, 0.3);
    cm.opacityFresnelParameters = new FresnelParameters();
    cm.opacityFresnelParameters.leftColor = Color3.Black();
    cm.opacityFresnelParameters.rightColor = Color3.White();
    cm.opacityFresnelParameters.power = 2;
    corona.material = cm;
    corona.isPickable = false;

    for (const p of PLANETS) this.makePlanet(p, glow);

    scene.onPointerObservable.add((info) => {
      if (this.flying) return;
      if (info.type === 4 /* POINTERMOVE */) {
        const hit = scene.pick(scene.pointerX, scene.pointerY, (m) => !!m.metadata?.planet);
        this.hover = (hit?.pickedMesh?.metadata?.planet as PlanetId) ?? null;
        engine.getRenderingCanvas()!.style.cursor = this.hover ? 'pointer' : 'default';
      } else if (info.type === 32 /* POINTERTAP */) {
        const hit = scene.pick(scene.pointerX, scene.pointerY, (m) => !!m.metadata?.planet);
        const id = hit?.pickedMesh?.metadata?.planet as PlanetId | undefined;
        if (id) this.onPick(id);
      }
    });
  }

  private makePlanet(p: PlanetDef, glow: GlowLayer) {
    const scene = this.scene;
    const R = p.orbit.size;
    const root = new TransformNode(p.id, scene);
    const body = MeshBuilder.CreateSphere(p.id + 'Body', { diameter: R * 2, segments: 48 }, scene);
    body.parent = root;
    body.metadata = { planet: p.id };
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
    const clouds = MeshBuilder.CreateSphere(p.id + 'Clouds', { diameter: R * 2.03, segments: 32 }, scene);
    clouds.parent = root;
    clouds.isPickable = false;
    const clm = new StandardMaterial(p.id + 'CloudMat', scene);
    const ct = tex(scene, 'textures/planets/clouds_2k.jpg');
    ct.getAlphaFromRGB = true;
    clm.opacityTexture = ct;
    clm.specularColor = Color3.Black();
    clm.alpha = p.id === 'ocean' ? 0.5 : 0.18;
    clouds.material = clm;
    const atm = MeshBuilder.CreateSphere(p.id + 'Atm', { diameter: R * 2.16, segments: 32 }, scene);
    atm.parent = root;
    atm.isPickable = false;
    const am = new StandardMaterial(p.id + 'AtmMat', scene);
    am.emissiveColor = p.id === 'ocean' ? new Color3(0.4, 0.7, 1) : new Color3(0.6, 0.7, 0.9);
    am.alpha = 0.16;
    am.disableLighting = true;
    am.emissiveFresnelParameters = new FresnelParameters();
    am.emissiveFresnelParameters.bias = 0.2;
    am.emissiveFresnelParameters.power = 3;
    am.emissiveFresnelParameters.leftColor = Color3.White();
    am.emissiveFresnelParameters.rightColor = Color3.Black();
    atm.material = am;

    // Orbit line and a selection ring that lights up on hover.
    const pts: Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new Vector3(Math.cos(a) * p.orbit.radius, 0, Math.sin(a) * p.orbit.radius));
    }
    const orbit = MeshBuilder.CreateLines(p.id + 'Orbit', { points: pts }, scene);
    orbit.color = new Color3(0.25, 0.45, 0.8);
    orbit.alpha = 0.35;
    orbit.isPickable = false;
    const ring = MeshBuilder.CreateTorus(p.id + 'Ring', { diameter: R * 2.9, thickness: 0.9, tessellation: 64 }, scene);
    ring.parent = root;
    const rm = new StandardMaterial(p.id + 'RingMat', scene);
    rm.emissiveColor = new Color3(0.45, 0.75, 1.4);
    rm.disableLighting = true;
    ring.material = rm;
    ring.isPickable = false;
    glow.addIncludedOnlyMesh(ring);
    this.bodies.set(p.id, { def: p, root, body, clouds, ring, angle: p.orbit.phase });
  }

  update(dt: number) {
    this.t += dt;
    const h = this.scene.getEngine().getRenderingCanvas()!.clientHeight || 1;
    const perPx = (2 * this.camera.radius * Math.tan(this.camera.fov / 2)) / h;
    this.camera.targetScreenOffset.x = this.flying ? 0 : this.screenShift * perPx;
    this.sun.rotation.y = this.t * 0.02;
    for (const b of this.bodies.values()) {
      if (!this.flying) b.angle += dt * b.def.orbit.speed;
      b.root.position.set(Math.cos(b.angle) * b.def.orbit.radius, 0, Math.sin(b.angle) * b.def.orbit.radius);
      b.body.rotation.y = this.t * 0.06;
      b.clouds.rotation.y = this.t * 0.075;
      const on = b.def.id === this.hover;
      b.ring.visibility = on ? 1 : 0.35;
      b.ring.rotation.x = Math.PI / 2 + Math.sin(this.t * 0.6) * 0.15;
      b.ring.scaling.setAll(on ? 1 + Math.sin(this.t * 5) * 0.03 : 1);
    }
  }

  /** Screen position (CSS pixels) of a planet's label anchor, or null when it is behind the camera. */
  labelPos(id: PlanetId): { x: number; y: number } | null {
    const b = this.bodies.get(id);
    if (!b) return null;
    const eng = this.scene.getEngine();
    const w = eng.getRenderWidth(), h = eng.getRenderHeight();
    const anchor = b.root.position.add(new Vector3(0, b.def.orbit.size * 1.5, 0));
    const p = Vector3.Project(anchor, Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(w, h));
    if (p.z < 0 || p.z > 1) return null;
    const scale = (eng.getRenderingCanvas()!.clientWidth || w) / w;
    return { x: p.x * scale, y: p.y * scale };
  }

  /** Fly the camera to a planet; resolves when the zone map should take over. */
  flyTo(id: PlanetId): Promise<void> {
    const b = this.bodies.get(id);
    if (!b) return Promise.resolve();
    this.flying = true;
    this.camera.detachControl();
    this.camera.lowerRadiusLimit = 1;
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    Animation.CreateAndStartAnimation('sysAim', this.camera, 'target', 60, 60, this.camera.target.clone(), b.root.position.clone(), Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    Animation.CreateAndStartAnimation('sysDive', this.camera, 'radius', 60, 60, this.camera.radius, b.def.orbit.size * 3.2, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    return new Promise((res) => setTimeout(res, 1050));
  }

  reset() {
    this.flying = false;
    this.scene.stopAnimation(this.camera);
    this.camera.lowerRadiusLimit = 420;
    this.camera.target = Vector3.Zero();
    this.camera.alpha = CAM.alpha;
    this.camera.beta = CAM.beta;
    this.camera.radius = CAM.radius;
    this.camera.attachControl(this.scene.getEngine().getRenderingCanvas()!, true);
  }

  render() {
    this.scene.render();
  }
}
