// v0.40 · Balas en 3D para las cámaras cercanas (en la cenital siguen las trazas 2D). Cada arma dispara su calibre: la
// bala de ese calibre (modelo del paquete «FIELDWORK P05 Ammo Bundle» de CuiGames si está en models/extra/balas, que se
// genera con tools/balas/extraer.mjs; si no, una ojiva hecha aquí con sus medidas reales) con su trazadora detrás, un
// fogonazo en la boca del arma y la vaina saltando del arma. Las armas de energía disparan rayos o bolas de plasma.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type Caliber = '9mm' | '45acp' | '357' | '556' | '762x39' | '762x51' | '50bmg' | '12ga';
type Kind = Caliber | 'plasma' | 'riel' | 'pulso' | 'aguja' | 'virote' | 'dardo' | 'taser' | 'sonico' | 'granada';
/** Medidas reales de la bala (m) y cómo se ve su trazadora (losetas ≈ m). */
const CAL: Record<Caliber, { d: number; l: number; tracer: number; w: number; color: number; pellets?: number }> = {
  '9mm': { d: 0.009, l: 0.0155, tracer: 1.0, w: 0.034, color: 0xffe2a0 },
  '45acp': { d: 0.0115, l: 0.017, tracer: 0.9, w: 0.038, color: 0xffd890 },
  '357': { d: 0.0091, l: 0.018, tracer: 1.2, w: 0.036, color: 0xffe2a0 },
  '556': { d: 0.0057, l: 0.023, tracer: 1.8, w: 0.036, color: 0xfff0b0 },
  '762x39': { d: 0.0079, l: 0.026, tracer: 2.0, w: 0.042, color: 0xffd080 },
  '762x51': { d: 0.0078, l: 0.029, tracer: 2.4, w: 0.044, color: 0xffd080 },
  '50bmg': { d: 0.0129, l: 0.058, tracer: 3.2, w: 0.07, color: 0xffb060 },
  '12ga': { d: 0.0084, l: 0.0084, tracer: 0.6, w: 0.026, color: 0xffc070, pellets: 9 },
};
/** Arma → calibre (siguiendo la lógica de cada arma; si no está en la lista, por su munición). */
const BY_WEAPON: Record<string, Caliber> = {
  'pistola-ligera': '9mm', 'pistola-compacta': '9mm', 'pistola-inteligente': '9mm', 'dedo-pistola-arma': '9mm',
  'subfusil-compacto': '9mm', 'smg-inteligente': '9mm',
  'pistola-silenciada': '45acp', subfusil: '45acp', // (.45 subsónica: lo típico en armas con silenciador y subfusiles pesados)
  'revolver-pesado': '357',
  'rifle-asalto': '556', 'ametralladora-ligera': '556',
  carabina: '762x39',
  'rifle-precision': '762x51', 'ametralladora-rotativa': '762x51',
  'francotirador-inteligente': '50bmg',
  'escopeta-corta': '12ga', 'escopeta-bombeo': '12ga', 'escopeta-tecnologica': '12ga', 'canon-antebrazo-arma': '12ga',
};
const BY_AMMO: Record<string, Kind> = { 'bala-pistola': '9mm', 'bala-rifle': '556', cartucho: '12ga', aguja: 'aguja', virote: 'virote', 'dardo-sedante': 'dardo', 'carga-taser': 'taser', 'granada-emp': 'granada' };
export function kindFor(weapon: string, ammo?: string, family?: string): Kind {
  if (BY_WEAPON[weapon]) return BY_WEAPON[weapon];
  if (/plasma|termica/.test(weapon)) return 'plasma';
  if (/riel/.test(weapon)) return 'riel';
  if (/pulsos/.test(weapon)) return 'pulso';
  if (/sonico/.test(weapon)) return 'sonico';
  if (family === 'Táser') return 'taser';
  return BY_AMMO[ammo ?? ''] ?? '9mm';
}
export const caliberName: Record<Caliber, string> = { '9mm': '9 mm', '45acp': '.45 ACP', '357': '.357 Magnum', '556': '5,56 mm', '762x39': '7,62×39', '762x51': '7,62×51', '50bmg': '.50 BMG', '12ga': 'calibre 12' };

/** La bala se dibuja más grande que en la realidad (si no, no se vería) y en proporción entre calibres. */
const SHOW = 4;
/** Las vainas, algo mayores que en la realidad (sin pasarse: una del .50 ya mide 14 cm). */
const CASE_SHOW = 1.7;
interface Shot { mesh: THREE.Object3D; tracer: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; len: number; kind: Kind; hit: boolean }
interface Shell { mesh: THREE.Object3D; v: THREE.Vector3; spin: THREE.Vector3; t0: number; rest: boolean }
interface Flash { mesh: THREE.Sprite; t0: number; life: number }

export class Bullets3D {
  readonly group = new THREE.Group();
  private shots: Shot[] = [];
  private shells: Shell[] = [];
  private flashes: Flash[] = [];
  private models = new Map<string, THREE.Object3D>();
  private manifest: Record<string, { bala?: string; vaina?: string }> | null = null;
  private loading = false;
  private tracerGeo = new THREE.CylinderGeometry(1, 0.15, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5); // punta en z=0, cola hacia −z
  private mats = new Map<number, THREE.MeshBasicMaterial>();
  private flashTex: THREE.Texture;
  private procedural = new Map<string, THREE.Object3D>();

  constructor() {
    this.group.name = 'balas3d';
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.25, 'rgba(255,220,140,0.9)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.flashTex = new THREE.CanvasTexture(c);
  }

  /** Modelos del paquete (si se han generado en esta máquina). Sin ellos, ojivas con las medidas reales. */
  private ensureModels() {
    if (this.loading) return; this.loading = true;
    fetch('/models/extra/balas/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
      if (!m?.calibres) return;
      this.manifest = m.calibres;
      const loader = new GLTFLoader();
      for (const [cal, f] of Object.entries(this.manifest!)) for (const part of ['bala', 'vaina'] as const) {
        const file = f[part]; if (!file) continue;
        loader.loadAsync(`/models/extra/balas/${file}`).then((g) => {
          // Los cartuchos van a lo largo de z con la base en z=0: la bala vuela hacia +z.
          g.scene.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { const mm = me.material as THREE.MeshStandardMaterial; mm.emissive = new THREE.Color(part === 'bala' ? 0x4a2a10 : 0x1a1206); } });
          this.models.set(`${cal}-${part}`, g.scene);
        }).catch(() => {});
      }
    }).catch(() => {});
  }
  private mat(color: number, opacity = 0.9) {
    let m = this.mats.get(color);
    if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true }); this.mats.set(color, m); }
    return m;
  }
  /** Ojiva (o perdigón, o vaina) hecha a mano con las medidas del calibre: por si no están los modelos del paquete. */
  private proc(key: string, make: () => THREE.Object3D) { let o = this.procedural.get(key); if (!o) { o = make(); this.procedural.set(key, o); } return o.clone(); }
  private bulletMesh(cal: Caliber): THREE.Object3D {
    const m = this.models.get(`${cal}-bala`);
    if (m) { const o = m.clone(); o.scale.setScalar(SHOW); return o; }
    const c = CAL[cal];
    return this.proc(`b-${cal}`, () => {
      if (cal === '12ga') return new THREE.Mesh(new THREE.SphereGeometry(c.d / 2 * SHOW, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a8a92, metalness: 0.7, roughness: 0.4 }));
      const r = c.d / 2, L = c.l, pts: THREE.Vector2[] = [];
      // Perfil: culote plano, cuerpo cilíndrico y ojiva hasta la punta (sobre el eje +y, que luego se tumba en +z).
      pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, L * 0.45));
      for (let i = 1; i <= 6; i++) { const k = i / 6; pts.push(new THREE.Vector2(r * Math.cos(k * Math.PI / 2) ** 0.8, L * 0.45 + L * 0.55 * Math.sin(k * Math.PI / 2))); }
      const geo = new THREE.LatheGeometry(pts, 12).rotateX(Math.PI / 2);
      const me = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cal === '357' ? 0x2a2c30 : 0xc0784a, metalness: 0.8, roughness: 0.3, emissive: 0x3a1a08 }));
      me.scale.setScalar(SHOW); return me;
    });
  }
  private caseMesh(cal: Caliber): THREE.Object3D {
    const m = this.models.get(`${cal}-vaina`);
    if (m) { const o = m.clone(); o.scale.setScalar(CASE_SHOW); return o; }
    const c = CAL[cal];
    return this.proc(`v-${cal}`, () => {
      const len = cal === '12ga' ? 0.07 : c.l * 1.6, r = cal === '12ga' ? 0.0102 : c.d / 2 * 1.08;
      const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: cal === '12ga' ? 0xa01818 : 0xc89a40, metalness: cal === '12ga' ? 0.1 : 0.9, roughness: 0.35 }));
      me.scale.setScalar(CASE_SHOW); return me;
    });
  }

  /** Un disparo: de la boca del arma (`from`) al blanco (`to`); si falla, la bala sigue de largo. */
  fire(weapon: string, ammo: string | undefined, family: string | undefined, from: THREE.Vector3, to: THREE.Vector3, opts: { hit: boolean; burst: number; side: THREE.Vector3; reduceFlashes: boolean }) {
    this.ensureModels();
    const kind = kindFor(weapon, ammo, family), now = performance.now();
    const cal = (kind in CAL ? kind : null) as Caliber | null;
    const pellets = cal ? CAL[cal].pellets ?? 1 : 1;
    const shots = Math.max(1, opts.burst) * (kind === 'pulso' ? 2 : 1);
    const dir = to.clone().sub(from), dist = dir.length(); dir.normalize();
    for (let s = 0; s < shots; s++) for (let p = 0; p < pellets; p++) {
      const end = to.clone();
      // Perdigones: cono de dispersión. Fallos: pasa de largo por un lado.
      if (pellets > 1) end.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.5).multiplyScalar(Math.max(0.6, dist / 6)));
      if (!opts.hit) end.add(new THREE.Vector3((Math.random() - 0.5) * 1.4, (Math.random() - 0.3) * 0.8, (Math.random() - 0.5) * 1.4)).addScaledVector(dir, 8);
      const t0 = now + s * 70;
      let mesh: THREE.Object3D, len: number, color: number, w: number;
      if (cal) { mesh = this.bulletMesh(cal); len = CAL[cal].tracer; color = CAL[cal].color; w = CAL[cal].w; }
      else {
        const spec: Record<string, [number, number, number, number]> = { plasma: [0.09, 0.9, 0xff7a30, 0.06], riel: [0.03, 6, 0x43a8ff, 0.035], pulso: [0.05, 0.7, 0x43f3ff, 0.04], aguja: [0.012, 0.5, 0xb8fff0, 0.01], virote: [0.02, 0.15, 0xd8e0ec, 0.01], dardo: [0.015, 0.25, 0x9affc8, 0.01], taser: [0.02, 0, 0xffd23f, 0.008], sonico: [0.25, 0.2, 0x9ad8ff, 0.2], granada: [0.06, 0.3, 0x43f3ff, 0.03] };
        const [r, tl, col, ww] = spec[kind] ?? [0.03, 1, 0xffffff, 0.02];
        mesh = kind === 'virote' || kind === 'dardo' || kind === 'aguja'
          ? new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.4, kind === 'virote' ? 0.55 : 0.18, 5).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: kind === 'virote' ? 0x2a2a30 : col, metalness: 0.5, roughness: 0.4 }))
          : new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), this.mat(col, 1));
        len = tl; color = col; w = ww;
      }
      const tracer = new THREE.Mesh(this.tracerGeo, this.mat(color, cal ? 0.75 : 0.9));
      tracer.scale.set(w, w, Math.max(0.001, len)); tracer.visible = len > 0;
      mesh.add(tracer); tracer.scale.divide(mesh.scale); // (la trazadora no hereda la escala de la bala)
      mesh.position.copy(from); mesh.lookAt(end); mesh.visible = false;
      this.group.add(mesh);
      // Tiempo de vuelo: el mismo que la traza 2D (rápida, pero se ve). El riel es casi instantáneo.
      const travel = from.distanceTo(end);
      const dur = kind === 'riel' ? 60 : kind === 'virote' || kind === 'granada' ? 90 + travel * 28 : Math.min(320, 70 + travel * 12);
      this.shots.push({ mesh, tracer, from: from.clone(), to: end, t0, dur, len, kind, hit: opts.hit });
    }
    // Fogonazo y vaina (las de fuego).
    if (cal && !opts.reduceFlashes) this.flash(from, cal === '50bmg' || cal === '12ga' ? 0.7 : 0.45);
    else if (!cal && kind !== 'virote' && kind !== 'dardo' && !opts.reduceFlashes) this.flash(from, 0.35, color0(kind));
    if (cal) for (let s = 0; s < Math.min(3, shots); s++) {
      const shell = this.caseMesh(cal);
      shell.position.copy(from).addScaledVector(dir, -0.12);
      this.group.add(shell);
      const v = opts.side.clone().multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(0, 2.2 + Math.random(), 0)).addScaledVector(dir, -0.6);
      this.shells.push({ mesh: shell, v, spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20), t0: now + s * 70, rest: false });
    }
    while (this.shells.length > 40) { const o = this.shells.shift()!; this.group.remove(o.mesh); }
  }
  private flash(at: THREE.Vector3, size: number, color = 0xffffff) {
    const sm = new THREE.SpriteMaterial({ map: this.flashTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    const s = new THREE.Sprite(sm); s.position.copy(at); s.scale.setScalar(size); this.group.add(s);
    this.flashes.push({ mesh: s, t0: performance.now(), life: 70 });
  }

  update(dt: number) {
    const now = performance.now();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i], k = (now - s.t0) / s.dur;
      if (k < 0) continue;
      if (k >= 1) {
        this.group.remove(s.mesh);
        // Al llegar: chispazo pequeño donde pega (o donde cae, si falló).
        if (s.hit || Math.random() < 0.4) this.flash(s.to, s.kind === 'plasma' ? 0.6 : 0.22, s.kind === 'plasma' ? 0xff7a30 : s.kind === 'riel' || s.kind === 'pulso' ? 0x43c8ff : 0xffe0a0);
        this.shots.splice(i, 1); continue;
      }
      s.mesh.visible = true;
      s.mesh.position.lerpVectors(s.from, s.to, k);
      // La trazadora crece al salir del cañón (no atraviesa al tirador) y se acorta al llegar.
      const done = s.from.distanceTo(s.mesh.position), left = s.to.distanceTo(s.mesh.position);
      s.tracer.scale.z = Math.max(0.001, Math.min(s.len, done)) / s.mesh.scale.z;
      if (s.kind === 'riel') s.tracer.scale.z = done / s.mesh.scale.z;
      if (left < 0.05) s.mesh.visible = false;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i], k = (now - f.t0) / f.life; if (k >= 1) { this.group.remove(f.mesh); f.mesh.material.dispose(); this.flashes.splice(i, 1); } else f.mesh.material.opacity = 1 - k; }
    const g = 9.8, d = Math.min(0.05, dt);
    for (const sh of this.shells) {
      if (now < sh.t0 || sh.rest) { sh.mesh.visible = now >= sh.t0; continue; }
      sh.mesh.visible = true;
      sh.v.y -= g * d; sh.mesh.position.addScaledVector(sh.v, d);
      sh.mesh.rotation.x += sh.spin.x * d; sh.mesh.rotation.y += sh.spin.y * d; sh.mesh.rotation.z += sh.spin.z * d;
      // Bota en el suelo y se queda (tumbada) un rato.
      if (sh.mesh.position.y < 0.02) { sh.mesh.position.y = 0.02; if (Math.abs(sh.v.y) < 0.6) { sh.rest = true; sh.mesh.rotation.set(Math.PI / 2, 0, Math.random() * 6); } else { sh.v.y *= -0.35; sh.v.x *= 0.5; sh.v.z *= 0.5; sh.spin.multiplyScalar(0.5); } }
    }
    for (let i = this.shells.length - 1; i >= 0; i--) if (now - this.shells[i].t0 > 9000) { this.group.remove(this.shells[i].mesh); this.shells.splice(i, 1); }
  }
  clear() { for (const s of this.shots) this.group.remove(s.mesh); for (const s of this.shells) this.group.remove(s.mesh); for (const f of this.flashes) this.group.remove(f.mesh); this.shots = []; this.shells = []; this.flashes = []; }
}
function color0(k: Kind) { return k === 'plasma' ? 0xff7a30 : k === 'taser' ? 0xffd23f : 0x43c8ff; }
