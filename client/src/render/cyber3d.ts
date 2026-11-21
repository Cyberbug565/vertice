// v0.16 · Ciberware visible hecho a partir del propio cuerpo: el miembro de carne se oculta y en su lugar va uno
// robótico que sale de la misma malla (mismas proporciones, se dobla igual) con paneles, juntas, pistones y luces.
// Cuatro gamas con forma y color propios:
//   · chatarra  — piezas oxidadas y desparejas, más flaco que el brazo de carne, cables a la vista y tornillos;
//   · estándar  — gris pistola con juntas oscuras y una línea de luz;
//   · militar   — placas gruesas verde oliva y negro mate, juntas reforzadas;
//   · lujo      — paneles blancos brillantes con juntas negras y filos de luz finos (los más caros).
// También ojos (iris de luz), mandíbula metálica (cromo de cabeza) y placa de pecho con núcleo (cromo de torso).
import * as THREE from 'three';
import type { Human, KitData } from './human3d';
import { REG, HEAD_MORPH, HEAD_UNIFORMS } from './human3d';
import { shell, rigid, tubeGeo, mergeSimple, sat } from './clothes3d';

export type Tier = 'chatarra' | 'estandar' | 'militar' | 'lujo';
const STYLE: Record<Tier, { base: string; base2: string; joint: string; rough: number; metal: number; off: number; relax: number; glow: number }> = {
  chatarra: { base: '#5e5a54', base2: '#7a4a2c', joint: '#2a2622', rough: 0.85, metal: 0.55, off: -0.006, relax: 0, glow: 0.0 },
  estandar: { base: '#6a7078', base2: '#4e545c', joint: '#1c1e22', rough: 0.4, metal: 0.85, off: 0.003, relax: 1, glow: 0.8 },
  militar: { base: '#4a5038', base2: '#26282a', joint: '#141516', rough: 0.7, metal: 0.5, off: 0.012, relax: 3, glow: 0.5 },
  lujo: { base: '#f2f3f6', base2: '#e6e8ee', joint: '#0b0b0e', rough: 0.18, metal: 0.25, off: 0.004, relax: 4, glow: 1.4 },
};

/** Material de las piezas: paneles con ranuras, óxido en la chatarra, filos de luz en el lujo. */
export function robotMat(tier: Tier, accent: string, joint = false, face?: Record<string, { value: unknown }>): THREE.MeshStandardMaterial {
  const st = STYLE[tier];
  const m = new THREE.MeshStandardMaterial({ color: joint ? st.joint : st.base, roughness: joint ? 0.5 : st.rough, metalness: joint ? 0.7 : st.metal, side: THREE.DoubleSide });
  const u = { uNoGlow: { value: 0 }, uTier: { value: ['chatarra', 'estandar', 'militar', 'lujo'].indexOf(tier) }, uBase2: { value: new THREE.Color(st.base2) }, uAcc: { value: new THREE.Color(accent) }, uGlow: { value: joint ? 0 : st.glow }, uJoint: { value: joint ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    u.uNoGlow.value = m.userData.noGlow ? 1 : 0; Object.assign(sh.uniforms, u); if (face) Object.assign(sh.uniforms, face);
    sh.vertexShader = 'varying vec3 vRP;\n' + (face ? HEAD_UNIFORMS : '') + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRP = position;' + (face ? `\n if (position.y > uHead.x - 0.03) {\n${HEAD_MORPH}\n }` : ''));
    sh.fragmentShader = 'varying vec3 vRP;\nuniform float uTier;\nuniform vec3 uBase2;\nuniform vec3 uAcc;\nuniform float uGlow;\nuniform float uJoint;\nuniform float uNoGlow;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (uJoint < 0.5) {
          // Paneles: ranuras a lo largo y alrededor de la pieza.
          float g1 = abs(fract(vRP.x * 16.0 + vRP.y * 4.0) - 0.5), g2 = abs(fract(vRP.y * 11.0 + vRP.z * 6.0) - 0.5);
          float groove = smoothstep(0.455, 0.485, max(g1, g2));
          float n = fract(sin(dot(floor(vRP * 38.0), vec3(12.9, 78.2, 37.7))) * 43758.5);
          vec3 c = mix(diffuseColor.rgb, uBase2, step(0.5, fract(vRP.y * 5.5 + vRP.x * 2.0)) * (uTier < 0.5 ? 1.0 : 0.35));
          if (uTier < 0.5) { c = mix(c, vec3(0.42, 0.2, 0.08), step(0.62, n) * 0.8); c *= 0.75 + 0.35 * n; } // óxido y abolladuras
          diffuseColor.rgb = c * (1.0 - 0.7 * groove);
          if (uTier > 2.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), groove);              // lujo: juntas negras
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uJoint < 0.5 && uGlow > 0.0 && uNoGlow < 0.5) {
          float line = smoothstep(0.484, 0.494, abs(fract(vRP.y * 11.0 + vRP.z * 6.0) - 0.5));
          totalEmissiveRadiance += uAcc * uGlow * line * step(0.0, vRP.z) * (uTier > 2.5 ? 1.0 : 0.6);
        }`);
  };
  m.customProgramCacheKey = () => `vt-robot-2-${face ? 'c' : 's'}`;
  return m;
}

/** Cromo visible de una persona: devuelve los materiales (y oculta la carne del miembro sustituido). */
export function roboticParts(h: Human, parts: Set<string>, tiers: Record<string, string>, accent: string, seed: number, cover: number[], separateHands: Set<string>): THREE.Material[] {
  const d = h.kit.data, L = d.L, body = h.bodyMesh, kind = h.kind;
  const mats: THREE.Material[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.SkinnedMesh(g, m);
    mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale);
    body.parent!.add(mesh); mesh.updateMatrixWorld(true); mesh.bind(body.skeleton, body.bindMatrix); mesh.frustumCulled = false;
    if (!mats.includes(m)) mats.push(m);
  };
  const face = (body.material as THREE.Material).userData.face;
  const pickTier = (p: string): Tier => {
    const t = tiers[p];
    if (t === 'chatarra' || t === 'estandar' || t === 'militar' || t === 'lujo') return t;
    return (['chatarra', 'estandar', 'estandar', 'militar', 'lujo'] as Tier[])[(seed >>> 3) % 5];
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const limb = (key: string, regs: number[], side: 1 | -1, isArm: boolean) => {
    const tier = pickTier(key), st = STYLE[tier];
    for (const r of regs) cover[r] = 5; // la carne de ese miembro no se dibuja
    const plate = robotMat(tier, accent), joint = robotMat(tier, accent, true), capM = robotMat(tier, accent); capM.userData.noGlow = true;
    const rs = new Set(regs);
    add(shell(d, kind, { key: `robo:${key}:${tier}:${regs.join(',')}`, cov: (v) => (rs.has(v.reg) ? 1 : -1), off: (v) => st.off + (tier === 'militar' && v.ny > -0.3 ? 0.004 : 0), relax: st.relax }), plate);
    const sx = side;
    const sfx = side > 0 ? '_l' : '_r';
    const parts: THREE.BufferGeometry[] = [], jparts: THREE.BufferGeometry[] = [];
    if (isArm) {
      const sh = V(sx * L.shX, L.armY, 0), el = V(sx * L.elX, L.armY, 0), wr = V(sx * L.wrX, L.armY, 0);
      const cap = new THREE.SphereGeometry(tier === 'militar' ? 0.07 : 0.06, 18, 12); cap.scale(1, 0.9, 1); cap.translate(sh.x, sh.y + 0.005, sh.z); parts.push(cap);
      const hinge = new THREE.CylinderGeometry(0.03, 0.03, 0.085, 16); hinge.rotateX(Math.PI / 2); hinge.translate(el.x, el.y, el.z); jparts.push(hinge);
      const ring = new THREE.TorusGeometry(0.033, 0.008, 8, 20); ring.rotateY(Math.PI / 2); ring.translate(wr.x - sx * 0.01, wr.y, wr.z); jparts.push(ring);
      add(rigid(d, mergeSimple(parts), `upperarm${sfx}`), capM);
      add(rigid(d, mergeSimple([hinge]), `lowerarm${sfx}`), joint);
      add(rigid(d, mergeSimple([ring]), `hand${sfx}`), joint);
      // Pistones del antebrazo (y cables en la chatarra).
      const pist: THREE.BufferGeometry[] = [];
      for (const dz of [-0.022, 0.022]) { const len = Math.abs(wr.x - el.x) - 0.08; const c = new THREE.CylinderGeometry(0.006, 0.006, len, 8); c.rotateZ(Math.PI / 2); c.translate((el.x + wr.x) / 2, el.y - 0.03, dz); pist.push(c); }
      add(rigid(d, mergeSimple(pist), `lowerarm${sfx}`), joint);
      if (tier === 'chatarra') {
        const cab: THREE.BufferGeometry[] = [];
        for (let k = 0; k < 2; k++) { const pts: THREE.Vector3[] = []; for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * Math.PI * 4 + k * Math.PI; pts.push(V(sx * (L.shX + 0.04 + t * (L.wrX - L.shX - 0.08)), L.armY + Math.cos(a) * 0.045, Math.sin(a) * 0.045)); } cab.push(tubeGeo(pts, 0.005, 0.005, 40, 5)); }
        const bolts: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 6; i++) { const b = new THREE.SphereGeometry(0.006, 6, 4); b.translate(sx * (L.shX + 0.05 + i * 0.07), L.armY + 0.042, (i % 2 ? 0.02 : -0.02)); bolts.push(b); }
        add(rigid(d, mergeSimple([...cab, ...bolts]), `lowerarm${sfx}`, { bone: `upperarm${sfx}`, f: (p) => (Math.abs(el.x) - Math.abs(p.x)) / 0.12 + 0.5 }), robotMat(tier, accent, true));
      }
      if (tier === 'lujo' || tier === 'estandar') {
        const strip = new THREE.BoxGeometry(Math.abs(wr.x - el.x) - 0.06, 0.004, 0.004); strip.translate((el.x + wr.x) / 2, el.y + 0.035, 0.012);
        const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.4), toneMapped: false });
        add(rigid(d, strip, `lowerarm${sfx}`), gm);
      }
    } else {
      const hp = V(sx * L.legX, L.hipY, 0), kn = V(sx * L.legX, L.kneeY, 0.01), an = V(sx * L.legX, L.ankY, -0.01);
      const kcap = new THREE.SphereGeometry(tier === 'militar' ? 0.06 : 0.05, 16, 10); kcap.scale(1, 1, 0.8); kcap.translate(kn.x, kn.y, kn.z + 0.04);
      add(rigid(d, kcap, `calf${sfx}`), capM);
      const hinge = new THREE.CylinderGeometry(0.035, 0.035, 0.11, 16); hinge.rotateZ(Math.PI / 2); hinge.translate(kn.x, kn.y, kn.z);
      add(rigid(d, hinge, `calf${sfx}`), joint);
      const ring = new THREE.TorusGeometry(0.04, 0.009, 8, 20); ring.rotateX(Math.PI / 2); ring.translate(an.x, an.y + 0.02, an.z);
      add(rigid(d, ring, `foot${sfx}`), joint);
      const hipCap = new THREE.SphereGeometry(0.075, 16, 10); hipCap.scale(1, 0.7, 1); hipCap.translate(hp.x * 1.05, hp.y + 0.01, 0);
      add(rigid(d, hipCap, `thigh${sfx}`), capM);
      const pist: THREE.BufferGeometry[] = [];
      for (const dx of [-0.025, 0.025]) { const len = kn.y - an.y - 0.08; const c = new THREE.CylinderGeometry(0.007, 0.007, len, 8); c.translate(kn.x + dx, (kn.y + an.y) / 2, -0.035); pist.push(c); }
      add(rigid(d, mergeSimple(pist), `calf${sfx}`), joint);
    }
  };
  if (parts.has('brazo_izq')) limb('brazo_izq', separateHands.has('mano_izq') ? [REG.uaP, REG.faP] : [REG.uaP, REG.faP, REG.handP], 1, true);
  if (parts.has('brazo_der')) limb('brazo_der', separateHands.has('mano_der') ? [REG.uaM, REG.faM] : [REG.uaM, REG.faM, REG.handM], -1, true);
  if (parts.has('pierna_izq')) limb('pierna_izq', [REG.thP, REG.caP, REG.ftP], 1, false);
  if (parts.has('pierna_der')) limb('pierna_der', [REG.thM, REG.caM, REG.ftM], -1, false);
  // Mandíbula metálica (cromo de cabeza).
  if (parts.has('cabeza')) {
    const tier = pickTier('cabeza');
    add(shell(d, kind, { key: `robo:mandibula:${tier}`, cov: (v, LL) => (v.reg === REG.head ? Math.min((LL.mouthY + 0.003) - v.y, v.z + 0.035, v.y - (LL.headBase - 0.05)) : -1), off: () => (tier === 'militar' ? 0.008 : 0.004), relax: 2 }), robotMat(tier, accent, false, face));
    const vents: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) { const b = new THREE.BoxGeometry(0.03, 0.0035, 0.006); b.translate(0, L.mouthY - 0.028 - i * 0.008, L.faceZ - 0.005); vents.push(b); }
    add(rigid(d, mergeSimple(vents), 'Head'), robotMat(tier, accent, true, face));
  }
  // Placa de pecho con núcleo (cromo de torso).
  if (parts.has('torso')) {
    const tier = pickTier('torso');
    add(shell(d, kind, { key: `robo:pecho:${tier}`, cov: (v, LL) => (v.reg === REG.torso ? Math.min(0.075 - Math.abs(v.x), v.y - (LL.chestY - 0.13), (LL.chestY + 0.07) - v.y, v.z - 0.02) : -1), off: () => 0.005, relax: 2 }), robotMat(tier, accent));
    const core = new THREE.CylinderGeometry(0.024, 0.024, 0.01, 24); core.rotateX(Math.PI / 2); core.translate(0, L.chestY - 0.02, 0.135);
    add(rigid(d, core, 'spine_03'), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.6), toneMapped: false }));
  }
  // Ojos cibernéticos: iris de luz (la chatarra, uno rojo y otro desparejo; el lujo, blanco con luz del acento).
  if (parts.has('ojos')) {
    const tier = pickTier('ojos');
    let k = 0;
    body.parent!.traverse((o) => {
      const m = o as THREE.Mesh; const mt = m.material as THREE.MeshStandardMaterial;
      if (!m.isMesh || !mt?.name?.includes('Eyes')) return;
      const em = mt.clone(); mats.push(em); m.material = em;
      em.emissive = new THREE.Color(tier === 'chatarra' ? (k++ % 2 ? '#ff2a1a' : '#ffaa30') : accent);
      em.emissiveIntensity = tier === 'lujo' ? 1.6 : tier === 'chatarra' ? 1.1 : 1.3;
      if (tier === 'lujo') em.color = new THREE.Color('#f4f6fa');
    });
  }
  return mats;
}
export { sat };
export type { KitData };
