// The stage: one WebGL renderer, instanced nodes, fat-line edges and glass planes. It never
// decides what a scene means; it eases every object from its current look toward the look the
// model asks for (positions, colour, size, visibility, camera), so scenes blend into each other.
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { bankHex } from "@/lib/banks";
import { C, type Frame, type Model, type V3 } from "./model";

export type LabelSink = (i: number, x: number, y: number, opacity: number) => void;

const BG = new THREE.Color(C.bg);
const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type EdgeSet = { idx: number[]; lines: LineSegments2; geo: LineSegmentsGeometry; pos: Float32Array; col: Float32Array };
type PlaneObj = { group: THREE.Group; mats: { m: THREE.Material & { opacity: number }; k: number }[]; v: number };
type Marker = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; key: string; o: number; target: number };

export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 700);
  private model: Model;
  private reduced: boolean;
  private onLabel: LabelSink;
  private index = new Map<string, number>();
  private target: Frame;
  // current, eased state
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vis: Float32Array;
  private ecol: Float32Array;
  private evis: Float32Array;
  private lvis: Float32Array;
  private camPos = new THREE.Vector3();
  private camTgt = new THREE.Vector3();
  private nodesMesh: THREE.InstancedMesh;
  private thin: EdgeSet;
  private bold: EdgeSet;
  private pulses: THREE.InstancedMesh;
  private flowEdges: number[];
  private planes: PlaneObj[] = [];
  private markers: Marker[] = [];
  private edgeEnds: [number, number][];
  private raf = 0;
  private last = 0;
  private t = 0;
  private running = false;
  private width = 1;
  private height = 1;
  private disposables: { dispose: () => void }[] = [];

  constructor(canvas: HTMLCanvasElement, model: Model, opts: { reduced: boolean; onLabel: LabelSink }) {
    this.model = model;
    this.reduced = opts.reduced;
    this.onLabel = opts.onLabel;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    model.nodes.forEach((n, i) => this.index.set(n.key, i));
    const N = model.nodes.length;
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.vis = new Float32Array(N);
    this.edgeEnds = model.edges.map((e) => [this.index.get(e.a) ?? -1, this.index.get(e.b) ?? -1]);
    this.ecol = new Float32Array(model.edges.length * 3);
    this.evis = new Float32Array(model.edges.length);
    this.lvis = new Float32Array(model.labels.length);

    // lights: a bright sky dome and one soft key, tuned for a light page
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd4e6fb, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(30, 90, 60);
    this.scene.add(key);

    this.buildFloor();
    this.buildPlanes();

    const sphere = new THREE.SphereGeometry(1, 24, 16);
    const nodeMat = new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.04 });
    this.nodesMesh = new THREE.InstancedMesh(sphere, nodeMat, Math.max(1, N));
    this.nodesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.nodesMesh.frustumCulled = false;
    for (let i = 0; i < N; i++) this.nodesMesh.setColorAt(i, BG);
    this.scene.add(this.nodesMesh);
    this.disposables.push(sphere, nodeMat);

    const thinIdx: number[] = [], boldIdx: number[] = [];
    model.edges.forEach((e, i) => { if (this.edgeEnds[i][0] >= 0 && this.edgeEnds[i][1] >= 0) (e.bold ? boldIdx : thinIdx).push(i); });
    this.thin = this.edgeSet(thinIdx, 1.3);
    this.bold = this.edgeSet(boldIdx, 3.2);

    this.flowEdges = model.edges.map((e, i) => (e.flow ? i : -1)).filter((i) => i >= 0);
    const pg = new THREE.SphereGeometry(1, 12, 8);
    const pm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pulses = new THREE.InstancedMesh(pg, pm, Math.max(1, this.flowEdges.length * 2));
    this.pulses.frustumCulled = false;
    for (let i = 0; i < this.pulses.count; i++) this.pulses.setColorAt(i, new THREE.Color(C.blue).lerp(new THREE.Color(0xffffff), 0.35));
    this.scene.add(this.pulses);
    this.disposables.push(pg, pm);

    const tg = new THREE.TorusGeometry(1, 0.055, 8, 64);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(tg, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.markers.push({ mesh, mat, key: "", o: 0, target: 0 });
      this.disposables.push(mat);
    }
    this.disposables.push(tg);

    // start from the first scene's look, already settled
    this.target = model.frame(0, 0);
    this.snap();
  }

  private edgeSet(idx: number[], width: number): EdgeSet {
    const geo = new LineSegmentsGeometry();
    const pos = new Float32Array(Math.max(1, idx.length) * 6);
    const col = new Float32Array(Math.max(1, idx.length) * 6);
    geo.setPositions(pos);
    geo.setColors(col);
    const mat = new LineMaterial({ linewidth: width, vertexColors: true, worldUnits: false, alphaToCoverage: true });
    const lines = new LineSegments2(geo, mat);
    lines.frustumCulled = false;
    this.scene.add(lines);
    this.disposables.push(geo, mat);
    // the attributes setPositions/setColors created: written in place every frame
    const p = (geo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data.array as Float32Array;
    const c = (geo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data.array as Float32Array;
    return { idx, lines, geo, pos: p, col: c };
  }

  private buildFloor() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(11,42,91,0.22)");
    g.addColorStop(0.55, "rgba(11,42,91,0.07)");
    g.addColorStop(1, "rgba(11,42,91,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(150, 150);
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -7;
    this.scene.add(floor);
    this.disposables.push(tex, mat, geo);
  }

  private dotTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(8,124,248,0.32)";
    ctx.beginPath();
    ctx.arc(32, 32, 2.2, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    this.disposables.push(tex);
    return tex;
  }

  private buildPlanes() {
    const dots = this.dotTexture();
    for (const p of this.model.planes) {
      const group = new THREE.Group();
      group.position.set(p.center[0], p.center[1], p.center[2]);
      const mats: PlaneObj["mats"] = [];
      const r = Math.min(p.w, p.d) * 0.06;
      const slab = new RoundedBoxGeometry(p.w, 0.5, p.d, 3, Math.min(r, 0.24));
      const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2,
        transparent: true, opacity: 0.7, depthWrite: false });
      group.add(new THREE.Mesh(slab, glass));
      mats.push({ m: glass, k: 0.7 });
      // rounded outline in sky blue
      const shape = new THREE.Shape();
      const w = p.w / 2, d = p.d / 2, rr = Math.min(1.4, r * 1.6);
      shape.moveTo(-w + rr, -d);
      shape.lineTo(w - rr, -d); shape.quadraticCurveTo(w, -d, w, -d + rr);
      shape.lineTo(w, d - rr); shape.quadraticCurveTo(w, d, w - rr, d);
      shape.lineTo(-w + rr, d); shape.quadraticCurveTo(-w, d, -w, d - rr);
      shape.lineTo(-w, -d + rr); shape.quadraticCurveTo(-w, -d, -w + rr, -d);
      const pts = shape.getPoints(10).map((v) => new THREE.Vector3(v.x, 0.27, v.y));
      const og = new THREE.BufferGeometry().setFromPoints(pts);
      const om = new THREE.LineBasicMaterial({ color: p.bank ? bankHex(p.bank) : C.sky, transparent: true, opacity: 0.9, depthWrite: false });
      group.add(new THREE.LineLoop(og, om));
      mats.push({ m: om, k: p.bank ? 0.75 : 0.95 });
      if (p.bank) {
        // a strip of the bank's colour along the front edge
        const sg = new THREE.BoxGeometry(p.w * 0.5, 0.14, 0.32);
        const sm = new THREE.MeshBasicMaterial({ color: bankHex(p.bank), transparent: true, opacity: 0.9, depthWrite: false });
        const strip = new THREE.Mesh(sg, sm);
        strip.position.set(0, 0.32, d - 0.7);
        group.add(strip);
        mats.push({ m: sm, k: 0.9 });
        this.disposables.push(sg, sm);
      } else {
        const tex = dots.clone();
        tex.repeat.set(p.w / 2.2, p.d / 2.2);
        tex.needsUpdate = true;
        const dg = new THREE.PlaneGeometry(p.w - 0.6, p.d - 0.6);
        const dm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false });
        const dmesh = new THREE.Mesh(dg, dm);
        dmesh.rotation.x = -Math.PI / 2;
        dmesh.position.y = 0.26;
        group.add(dmesh);
        mats.push({ m: dm, k: 0.6 });
        this.disposables.push(tex, dg, dm);
      }
      this.scene.add(group);
      this.planes.push({ group, mats, v: 0 });
      this.disposables.push(slab, glass, og, om);
    }
  }

  setState(scene: number, step: number) {
    this.target = this.model.frame(scene, step);
    // markers: re-target the rings at the scene's focus nodes
    this.markers.forEach((m, i) => {
      const want = this.target.markers[i];
      if (want) {
        if (m.key !== want.key) { m.key = want.key; m.o = this.reduced ? 1 : 0; }
        m.mat.color.set(want.color);
        m.target = 1;
      } else m.target = 0;
    });
    if (this.reduced) { this.snap(); this.render(); }
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = 40;
    this.camera.updateProjectionMatrix();
    const res = new THREE.Vector2(this.width, this.height);
    (this.thin.lines.material as LineMaterial).resolution.copy(res);
    (this.bold.lines.material as LineMaterial).resolution.copy(res);
    this.render();
  }

  start() {
    if (this.running || this.reduced) { this.render(); return; }
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.step(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private snap() {
    this.step(1, true);
  }

  /** Ease the current state toward the target. `instant` jumps there (reduced motion, first frame). */
  private step(dt: number, instant = false) {
    const T = this.target;
    const kp = instant ? 1 : 1 - Math.exp(-dt * 3.4);
    const kc = instant ? 1 : 1 - Math.exp(-dt * 4.2);
    const N = this.model.nodes.length;
    for (let i = 0; i < N; i++) {
      const l = T.nodes[i];
      const j = i * 3;
      this.pos[j] += (l.p[0] - this.pos[j]) * kp;
      this.pos[j + 1] += (l.p[1] - this.pos[j + 1]) * kp;
      this.pos[j + 2] += (l.p[2] - this.pos[j + 2]) * kp;
      tmpC.set(l.c);
      this.col[j] += (tmpC.r - this.col[j]) * kc;
      this.col[j + 1] += (tmpC.g - this.col[j + 1]) * kc;
      this.col[j + 2] += (tmpC.b - this.col[j + 2]) * kc;
      this.size[i] += (l.s - this.size[i]) * kc;
      this.vis[i] += (l.v - this.vis[i]) * kc;
    }
    for (let i = 0; i < T.edges.length; i++) {
      const e = T.edges[i];
      tmpC.set(e.c);
      const j = i * 3;
      this.ecol[j] += (tmpC.r - this.ecol[j]) * kc;
      this.ecol[j + 1] += (tmpC.g - this.ecol[j + 1]) * kc;
      this.ecol[j + 2] += (tmpC.b - this.ecol[j + 2]) * kc;
      this.evis[i] += (e.v - this.evis[i]) * kc;
    }
    for (let i = 0; i < T.labels.length; i++) this.lvis[i] += (T.labels[i] - this.lvis[i]) * (instant ? 1 : 1 - Math.exp(-dt * 5));
    this.planes.forEach((p, i) => { p.v += ((T.planes[i] ?? 0) - p.v) * kc; });
    const kcam = instant ? 1 : 1 - Math.exp(-dt * 2.2);
    this.camPos.lerp(tmpV.set(...T.cam.pos), kcam);
    this.camTgt.lerp(tmpV.set(...T.cam.target), kcam);
    for (const m of this.markers) m.o += (m.target - m.o) * (instant ? 1 : 1 - Math.exp(-dt * 4));
  }

  private nodeAt(key: string): V3 | null {
    const i = this.index.get(key);
    if (i === undefined) return null;
    return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]];
  }

  private render() {
    const N = this.model.nodes.length;
    for (let i = 0; i < N; i++) {
      const v = this.vis[i];
      const s = this.size[i] * (0.55 + 0.45 * Math.min(1, v)) * smooth(0, 0.06, v);
      tmpS.set(s, s, s);
      tmpV.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      tmpM.compose(tmpV, tmpQ, tmpS);
      this.nodesMesh.setMatrixAt(i, tmpM);
      tmpC.setRGB(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]).lerp(BG, 1 - Math.min(1, v));
      this.nodesMesh.setColorAt(i, tmpC);
    }
    this.nodesMesh.instanceMatrix.needsUpdate = true;
    if (this.nodesMesh.instanceColor) this.nodesMesh.instanceColor.needsUpdate = true;

    for (const set of [this.thin, this.bold]) {
      set.idx.forEach((ei, k) => {
        const [a, b] = this.edgeEnds[ei];
        const v = Math.min(1, this.evis[ei], this.vis[a] + 0.05, this.vis[b] + 0.05);
        const vv = v < 0.06 ? 0 : v;
        const o = k * 6;
        const hide = vv === 0;
        set.pos[o] = this.pos[a * 3]; set.pos[o + 1] = this.pos[a * 3 + 1]; set.pos[o + 2] = this.pos[a * 3 + 2];
        set.pos[o + 3] = hide ? set.pos[o] : this.pos[b * 3];
        set.pos[o + 4] = hide ? set.pos[o + 1] : this.pos[b * 3 + 1];
        set.pos[o + 5] = hide ? set.pos[o + 2] : this.pos[b * 3 + 2];
        tmpC.setRGB(this.ecol[ei * 3], this.ecol[ei * 3 + 1], this.ecol[ei * 3 + 2]).lerp(BG, 1 - vv);
        set.col[o] = set.col[o + 3] = tmpC.r;
        set.col[o + 1] = set.col[o + 4] = tmpC.g;
        set.col[o + 2] = set.col[o + 5] = tmpC.b;
      });
      (set.geo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data.needsUpdate = true;
      (set.geo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data.needsUpdate = true;
    }

    // money pulses along the cross-bank links that are on screen
    this.flowEdges.forEach((ei, k) => {
      const [a, b] = this.edgeEnds[ei];
      const v = this.evis[ei];
      for (let r = 0; r < 2; r++) {
        const f = (this.t * 0.32 + r * 0.5 + k * 0.17) % 1;
        const s = !this.reduced && v > 0.6 && a >= 0 && b >= 0 ? 0.2 * smooth(0.6, 1, v) : 0;
        tmpV.set(
          this.pos[a * 3] + (this.pos[b * 3] - this.pos[a * 3]) * f,
          this.pos[a * 3 + 1] + (this.pos[b * 3 + 1] - this.pos[a * 3 + 1]) * f + 0.05,
          this.pos[a * 3 + 2] + (this.pos[b * 3 + 2] - this.pos[a * 3 + 2]) * f,
        );
        tmpS.set(s, s, s);
        tmpM.compose(tmpV, tmpQ, tmpS);
        this.pulses.setMatrixAt(k * 2 + r, tmpM);
      }
    });
    this.pulses.instanceMatrix.needsUpdate = true;

    for (const p of this.planes) {
      p.group.visible = p.v > 0.01;
      for (const m of p.mats) m.m.opacity = m.k * p.v;
    }

    for (const m of this.markers) {
      const at = m.key ? this.nodeAt(m.key) : null;
      const i = this.index.get(m.key);
      m.mesh.visible = !!at && m.o > 0.01;
      if (at && i !== undefined) {
        const pulse = this.reduced ? 1 : 1 + 0.12 * Math.sin(this.t * 2.6);
        const s = Math.max(0.9, this.size[i] * 1.55) * pulse;
        m.mesh.position.set(at[0], at[1], at[2]);
        m.mesh.scale.set(s, s, s);
        m.mat.opacity = 0.85 * m.o;
      }
    }

    // camera, with a slow idle drift around the target
    const off = tmpV.copy(this.camPos).sub(this.camTgt);
    // a narrow canvas pulls the camera back so the framing still fits horizontally
    const a = this.camera.aspect;
    if (a < 1.15) off.multiplyScalar(Math.pow(1.15 / a, 0.85));
    if (!this.reduced) off.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.t * 0.16) * 0.07);
    this.camera.position.copy(this.camTgt).add(off);
    this.camera.lookAt(this.camTgt);
    this.camera.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);

    // HTML labels follow their anchors
    const v3 = new THREE.Vector3();
    this.model.labels.forEach((l, i) => {
      const o = this.lvis[i];
      if (o < 0.01) { this.onLabel(i, -1, -1, 0); return; }
      const a = typeof l.anchor === "string" ? this.nodeAt(l.anchor) : l.anchor;
      if (!a) { this.onLabel(i, -1, -1, 0); return; }
      // a label on a node sits just above the sphere, whatever its size
      const ni = typeof l.anchor === "string" ? this.index.get(l.anchor) : undefined;
      const lift = ni === undefined || l.below ? 0 : this.size[ni] * (0.55 + 0.45 * Math.min(1, this.vis[ni]));
      v3.set(a[0], a[1] + lift, a[2]).project(this.camera);
      if (v3.z > 1) { this.onLabel(i, -1, -1, 0); return; }
      this.onLabel(i, (v3.x * 0.5 + 0.5) * this.width, (-v3.y * 0.5 + 0.5) * this.height, Math.min(1, o));
    });
  }

  dispose() {
    this.stop();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    for (const d of this.disposables) d.dispose();
    this.nodesMesh.dispose();
    this.pulses.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
