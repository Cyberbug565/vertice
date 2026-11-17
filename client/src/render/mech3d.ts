// v0.16 · Superarmadura experimental «Tormenta» (Gobierno de Vértice): un exoesqueleto de dos veces la altura y la
// anchura de una persona, con el piloto dentro. Diseño propio inspirado en una figura de roca partida por rayos:
// encorvada, con hombros y antebrazos enormes, cabeza baja con ojos amarillos, manos y pies con garras, placas de
// aleación color pizarra facetadas como piedra, grietas de luz azul que laten, un núcleo de fusión en el pecho con
// anillos que giran y descargas eléctricas que saltan por la armadura.
// Se mueve con la misma pose del juego que la persona (andar, correr, golpear, apuntar, tumbarse), algo encorvada.
import * as THREE from 'three';
import { armorMat } from './human3d';

/** Placa facetada «de roca»: icosaedro deformado con ruido fijo por semilla, sombreado plano. */
function rock(rx: number, ry: number, rz: number, seed: number, detail = 1, rough = 0.18) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Ruido por vértice (los vértices repetidos comparten valor para no abrir grietas).
  const memo = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let n = memo.get(k); if (n === undefined) { n = 1 + (rnd() - 0.5) * 2 * rough; memo.set(k, n); }
    p.setXYZ(i, p.getX(i) * rx * n, p.getY(i) * ry * n, p.getZ(i) * rz * n);
  }
  const out = g.index ? g.toNonIndexed() : g; out.computeVertexNormals();
  return out;
}
const claw = (len: number, r: number) => { const g = new THREE.ConeGeometry(r, len, 6); g.translate(0, -len / 2, 0); return g; };

export interface Mech {
  root: THREE.Group; pelvis: THREE.Group; spine: THREE.Group; neck: THREE.Group;
  shP: THREE.Group; elP: THREE.Group; shM: THREE.Group; elM: THREE.Group;
  thP: THREE.Group; knP: THREE.Group; thM: THREE.Group; knM: THREE.Group;
  rings: THREE.Object3D[]; arcs: THREE.Line[]; arcPts: THREE.Object3D[]; mats: THREE.Material[]; nextArc: number; plate: THREE.MeshStandardMaterial;
}

/** Construye la armadura. Medidas en metros, con los pies en y = 0 y mirando a +Z. */
export function buildMech(accent = '#39a8ff'): Mech {
  // Placas: el material de la exoarmadura con las grietas más espaciadas (la textura se estira sobre cada placa).
  const base = armorMat();
  const plate = base.clone();
  for (const k of ['map', 'emissiveMap'] as const) { const t = (base[k] as THREE.Texture).clone(); t.repeat.set(0.6, 0.6); t.needsUpdate = true; plate[k] = t; }
  plate.emissiveIntensity = 1.1;
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.85, roughness: 0.35, flatShading: true });
  const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc83a').multiplyScalar(1.6), toneMapped: false });
  const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bff0ff').multiplyScalar(1.8), toneMapped: false });
  const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.85 });
  const arcM = new THREE.LineBasicMaterial({ color: new THREE.Color('#aee6ff').multiplyScalar(1.8), toneMapped: false, transparent: true, opacity: 0.9 });
  const mats = [plate, dark, eyeM, coreM, ringM, arcM];
  const G = () => new THREE.Group();
  const M = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.frustumCulled = false; parent.add(m); return m; };
  const root = G();
  const arcPts: THREE.Object3D[] = [];
  const mark = (parent: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); arcPts.push(o); };

  // Cadera.
  const pelvis = G(); pelvis.position.set(0, 1.55, 0); root.add(pelvis);
  M(pelvis, rock(0.42, 0.2, 0.3, 1), plate, 0, 0, 0);
  M(pelvis, rock(0.2, 0.14, 0.12, 2), plate, 0, -0.08, 0.24, 0.3);
  M(pelvis, new THREE.CylinderGeometry(0.22, 0.26, 0.16, 10), dark, 0, 0.17, 0);
  // Tronco (encorvado hacia delante).
  const spine = G(); spine.position.set(0, 0.2, 0); pelvis.add(spine);
  M(spine, rock(0.36, 0.26, 0.27, 3), plate, 0, 0.22, 0.02);
  const chest = G(); chest.position.set(0, 0.5, 0.05); spine.add(chest);
  M(chest, rock(0.62, 0.42, 0.42, 4), plate, 0, 0.3, 0);
  for (const s of [-1, 1]) M(chest, rock(0.3, 0.24, 0.14, 5 + s), plate, s * 0.22, 0.36, 0.3, 0.1, s * 0.2, 0);
  M(chest, rock(0.55, 0.36, 0.32, 8), plate, 0, 0.58, -0.22); // joroba
  for (let i = 0; i < 4; i++) M(chest, rock(0.09, 0.12, 0.08, 20 + i), plate, (i % 2 ? 1 : -1) * 0.12, 0.85 - Math.floor(i / 2) * 0.12, -0.36, -0.4); // crestas de la espalda
  // Núcleo de fusión con anillos.
  M(chest, new THREE.CylinderGeometry(0.14, 0.16, 0.08, 18), dark, 0, 0.32, 0.4, Math.PI / 2);
  M(chest, new THREE.SphereGeometry(0.085, 18, 12), coreM, 0, 0.32, 0.45);
  const rings: THREE.Object3D[] = [];
  for (const [r, t] of [[0.13, 0.012], [0.105, 0.008]] as const) { const ring = M(chest, new THREE.TorusGeometry(r, t, 8, 32), ringM, 0, 0.32, 0.46); rings.push(ring); }
  mark(chest, 0, 0.32, 0.45);
  // Cabeza baja, entre los hombros.
  const neck = G(); neck.position.set(0, 0.68, 0.22); chest.add(neck);
  M(neck, rock(0.2, 0.19, 0.24, 30), plate, 0, 0.1, 0.06);
  M(neck, rock(0.17, 0.08, 0.13, 31), plate, 0, -0.02, 0.18); // mandíbula
  M(neck, rock(0.22, 0.05, 0.1, 32), plate, 0, 0.17, 0.2); // ceja
  for (const s of [-1, 1]) M(neck, new THREE.BoxGeometry(0.06, 0.025, 0.02), eyeM, s * 0.075, 0.11, 0.285, 0, 0, -s * 0.25);
  for (let i = 0; i < 5; i++) M(neck, claw(0.05, 0.012), dark, -0.06 + i * 0.03, 0.03, 0.27, Math.PI); // dientes
  mark(neck, 0, 0.25, 0);
  // Brazos (lado +X = derecho del personaje).
  const arm = (s: 1 | -1) => {
    const sh = G(); sh.position.set(s * 0.74, 0.58, 0); chest.add(sh);
    M(sh, rock(0.4, 0.3, 0.38, 40 + s), plate, s * 0.06, 0.08, 0); // hombrera
    M(sh, rock(0.25, 0.4, 0.26, 42 + s), plate, 0, -0.38, 0);
    M(sh, new THREE.SphereGeometry(0.17, 12, 8), dark, 0, -0.76, 0);
    const el = G(); el.position.set(0, -0.78, 0); sh.add(el);
    M(el, rock(0.31, 0.46, 0.31, 44 + s), plate, 0, -0.38, 0.02);
    M(el, rock(0.2, 0.18, 0.2, 46 + s), plate, 0, -0.04, -0.12); // codo
    for (let i = 0; i < 3; i++) M(el, rock(0.06, 0.08, 0.05, 50 + i + s * 3), plate, s * 0.2, -0.2 - i * 0.18, -0.05, 0, 0, s * 0.4); // púas del antebrazo
    // Mano con cuatro garras y pulgar.
    const hand = G(); hand.position.set(0, -0.86, 0.04); el.add(hand);
    M(hand, rock(0.24, 0.17, 0.2, 60 + s), plate, 0, -0.04, 0);
    for (let f = 0; f < 4; f++) { const fg = G(); fg.position.set(-0.13 + f * 0.088, -0.16, 0.08); fg.rotation.x = 0.35; hand.add(fg); M(fg, rock(0.045, 0.08, 0.05, 70 + f), plate, 0, -0.05, 0); M(fg, claw(0.14, 0.03), dark, 0, -0.12, 0); }
    const th = G(); th.position.set(s * -0.17, -0.06, 0.12); th.rotation.set(0.6, 0, s * 0.7); hand.add(th); M(th, claw(0.16, 0.035), dark, 0, 0, 0);
    mark(hand, 0, -0.1, 0); mark(sh, s * 0.1, 0.2, 0);
    return { sh, el };
  };
  const P = arm(1), Mm = arm(-1);
  // Piernas cortas y anchas, con pies de tres garras.
  const leg = (s: 1 | -1) => {
    const th = G(); th.position.set(s * 0.32, -0.06, 0); pelvis.add(th);
    M(th, rock(0.29, 0.42, 0.31, 80 + s), plate, 0, -0.34, 0);
    const kn = G(); kn.position.set(0, -0.72, 0); th.add(kn);
    M(kn, rock(0.19, 0.16, 0.16, 82 + s), plate, 0, 0.02, 0.15); // rodillera
    M(kn, rock(0.25, 0.4, 0.27, 84 + s), plate, 0, -0.34, -0.02);
    const ft = G(); ft.position.set(0, -0.72, 0); kn.add(ft);
    M(ft, rock(0.28, 0.14, 0.38, 86 + s), plate, 0, -0.06, 0.12);
    for (let i = 0; i < 3; i++) { const c = M(ft, claw(0.18, 0.045), dark, -0.14 + i * 0.14, -0.12, 0.44); c.rotation.x = -Math.PI / 2 + 0.15; }
    mark(kn, 0, 0, 0.1);
    return { th, kn };
  };
  const LP = leg(1), LM = leg(-1);
  // Descargas: unas líneas quebradas que se rehacen solas entre puntos de la armadura.
  const arcs: THREE.Line[] = [];
  for (let i = 0; i < 4; i++) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3)); const l = new THREE.Line(g, arcM); l.frustumCulled = false; l.visible = false; root.add(l); arcs.push(l); }
  return { root, pelvis, spine, neck, shP: P.sh, elP: P.el, shM: Mm.sh, elM: Mm.el, thP: LP.th, knP: LP.kn, thM: LM.th, knM: LM.kn, rings, arcs, arcPts, mats, nextArc: 0, plate };
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), inv = new THREE.Matrix4();
/** Pone la armadura en la pose del juego (con su postura encorvada) y anima el núcleo y las descargas. */
export function poseMech(m: Mech, p: { hips: THREE.Object3D; spine: THREE.Object3D; neck: THREE.Object3D; shP: THREE.Object3D; elP: THREE.Object3D; shM: THREE.Object3D; elM: THREE.Object3D; thP: THREE.Object3D; knP: THREE.Object3D; thM: THREE.Object3D; knM: THREE.Object3D }, t: number) {
  m.pelvis.rotation.set(p.hips.rotation.x, p.hips.rotation.y, p.hips.rotation.z);
  m.spine.rotation.set(0.32 + p.spine.rotation.x, p.spine.rotation.y, 0);
  m.neck.rotation.set(-0.28 + p.neck.rotation.x, p.neck.rotation.y, 0);
  m.shP.rotation.set(p.shP.rotation.x * 0.9 - 0.15, 0, p.shP.rotation.z + 0.18);
  m.shM.rotation.set(p.shM.rotation.x * 0.9 - 0.15, 0, p.shM.rotation.z - 0.18);
  m.elP.rotation.set(p.elP.rotation.x - 0.35, 0, 0); m.elM.rotation.set(p.elM.rotation.x - 0.35, 0, 0);
  m.thP.rotation.set(p.thP.rotation.x - 0.25, 0, 0.06); m.thM.rotation.set(p.thM.rotation.x - 0.25, 0, -0.06);
  m.knP.rotation.set(p.knP.rotation.x + 0.4, 0, 0); m.knM.rotation.set(p.knM.rotation.x + 0.4, 0, 0);
  m.pelvis.position.y = 1.55 - 0.1; // rodillas dobladas: algo más baja
  m.plate.emissiveIntensity = 2.0 + 0.7 * Math.sin(t * 2.3) + (Math.sin(t * 17.0) > 0.96 ? 0.8 : 0); // las grietas laten
  for (const [i, r] of m.rings.entries()) { r.rotation.x = t * (i ? -1.7 : 1.1); r.rotation.y = t * (i ? 0.9 : -1.3); }
  // Descargas: cada ~0,1 s se rehace una entre dos puntos al azar (cerca del núcleo, los hombros, las manos o la cabeza).
  if (t > m.nextArc) {
    m.nextArc = t + 0.06 + Math.random() * 0.12;
    m.root.updateMatrixWorld(true); inv.copy(m.root.matrixWorld).invert();
    for (const l of m.arcs) {
      l.visible = Math.random() < 0.55; if (!l.visible) continue;
      const a = m.arcPts[Math.floor(Math.random() * m.arcPts.length)], b = m.arcPts[Math.floor(Math.random() * m.arcPts.length)];
      a.getWorldPosition(tmpA).applyMatrix4(inv); b.getWorldPosition(tmpB).applyMatrix4(inv);
      if (a === b) tmpB.add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8));
      const pos = l.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < 10; k++) {
        const u = k / 9, j = Math.sin(u * Math.PI) * 0.18;
        pos.setXYZ(k, tmpA.x + (tmpB.x - tmpA.x) * u + (Math.random() - 0.5) * j, tmpA.y + (tmpB.y - tmpA.y) * u + (Math.random() - 0.5) * j, tmpA.z + (tmpB.z - tmpA.z) * u + (Math.random() - 0.5) * j);
      }
      pos.needsUpdate = true;
    }
  }
}
