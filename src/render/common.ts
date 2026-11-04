import {
  AssetContainer,
  Color3,
  LoadAssetContainerAsync,
  Mesh,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;

export function tex(scene: Scene, path: string, opts?: { u?: number; v?: number }): Texture {
  const t = new Texture(ASSET_BASE + path, scene);
  if (opts?.u) t.uScale = opts.u;
  if (opts?.v) t.vScale = opts.v;
  return t;
}

export function emissiveMat(scene: Scene, name: string, c: [number, number, number], alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.emissiveColor = new Color3(...c);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.disableLighting = true;
  m.alpha = alpha;
  m.fogEnabled = false;
  return m;
}

/** Loads each GLB once per scene; instances share geometry and materials. */
export class ModelLibrary {
  private containers = new Map<string, Promise<AssetContainer>>();
  constructor(private scene: Scene) {}

  load(model: string): Promise<AssetContainer> {
    let p = this.containers.get(model);
    if (!p) {
      p = LoadAssetContainerAsync(`${ASSET_BASE}models/${model}.glb`, this.scene);
      this.containers.set(model, p);
    }
    return p;
  }

  /** Instance a model under a plain holder node (the glTF __root__ carries the handedness flip). */
  async instance(model: string, name = model): Promise<TransformNode> {
    const c = await this.load(model);
    return this.instanceFrom(c, name);
  }

  instanceFrom(c: AssetContainer, name: string): TransformNode {
    const inst = c.instantiateModelsToScene((n) => `${name}_${n}`, false);
    const holder = new TransformNode(name, this.scene);
    for (const r of inst.rootNodes) r.parent = holder;
    return holder;
  }
}

/**
 * Many copies of one mesh in a single draw call (SPEC §7.2). Call begin(), add() per visible item, end() once per frame.
 * Rotation is yaw-only, which is all the top-down game needs.
 */
export class ThinPool {
  private buf: Float32Array;
  private n = 0;
  constructor(public readonly mesh: Mesh, private capacity: number) {
    this.buf = new Float32Array(capacity * 16);
    mesh.thinInstanceSetBuffer('matrix', this.buf, 16, false);
    mesh.thinInstanceCount = 0;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isPickable = false;
  }
  begin() {
    this.n = 0;
  }
  add(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) {
    if (this.n >= this.capacity) this.grow();
    const o = this.n * 16;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const b = this.buf;
    b[o] = c * sx; b[o + 1] = 0; b[o + 2] = -s * sx; b[o + 3] = 0;
    b[o + 4] = 0; b[o + 5] = sy; b[o + 6] = 0; b[o + 7] = 0;
    b[o + 8] = s * sz; b[o + 9] = 0; b[o + 10] = c * sz; b[o + 11] = 0;
    b[o + 12] = x; b[o + 13] = y; b[o + 14] = z; b[o + 15] = 1;
    this.n++;
  }
  end() {
    this.mesh.thinInstanceCount = this.n;
    this.mesh.thinInstanceBufferUpdated('matrix');
  }
  private grow() {
    this.capacity *= 2;
    const nb = new Float32Array(this.capacity * 16);
    nb.set(this.buf);
    this.buf = nb;
    this.mesh.thinInstanceSetBuffer('matrix', this.buf, 16, false);
  }
}

/** Position of a wrapped decoration: the copy of (bx, bz) in a repeating tile that is nearest to the camera focus. */
export function wrap(b: number, focus: number, tile: number): number {
  return b + tile * Math.round((focus - b) / tile);
}
