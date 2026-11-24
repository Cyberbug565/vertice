// v0.40 · Balas por calibre a partir del paquete «FIELDWORK P05 Ammo Bundle» (CuiGames) de la release «balasyarmas».
// De cada calibre toma el cartucho suelto (LOD1) y saca dos piezas: la bala que vuela (encamisado de cobre o punta de
// plomo; en el calibre 12, nada: los perdigones se hacen en el juego) y la vaina, para los casquillos que salen
// despedidos. Las guarda como GLB mínimos (sin texturas, con el color de cada material) en
// client/public/models/extra/balas/.
//
// La licencia del paquete permite usar los modelos en el juego, pero NO redistribuir los archivos sueltos. Por eso esa
// carpeta no va en el repositorio (está en .gitignore): se genera en cada máquina con este script.
//
// Uso:
//   node tools/balas/extraer.mjs <carpeta con FIELDWORK_P05_Ammo_Bundle descomprimido>
//   node tools/balas/extraer.mjs --zip <FIELDWORK_P05_Ammo_Bundle_v1.1.zip>   (necesita «unzip»)
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'client', 'public', 'models', 'extra', 'balas');
/** Calibre del juego → carpeta y nombre del cartucho en el paquete. */
export const CALIBRES = {
  '9mm': ['A01_9mm', 'Ammo_9x19'],
  '556': ['A02_556', 'Ammo_5.56x45'],
  '12ga': ['A03_12ga', 'Ammo_12_70'],
  '45acp': ['A04_45ACP', 'Ammo_45ACP'],
  '357': ['A05_357Mag', 'Ammo_357Mag'],
  '762x39': ['A06_762x39', 'Ammo_7.62x39'],
  '762x51': ['A07_762x51', 'Ammo_7.62x51'],
  '50bmg': ['A08_50BMG', 'Ammo_50BMG'],
};
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Lee un accesor del glTF como array tipado compacto (sin huecos). */
function read(g, bin, i) {
  const a = g.accessors[i], bv = g.bufferViews[a.bufferView], T = COMP[a.componentType], n = NCOMP[a.type];
  const stride = bv.byteStride ?? T.BYTES_PER_ELEMENT * n, base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out = new T(a.count * n), view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const get = { 5126: (o) => view.getFloat32(o, true), 5125: (o) => view.getUint32(o, true), 5123: (o) => view.getUint16(o, true), 5121: (o) => view.getUint8(o), 5122: (o) => view.getInt16(o, true), 5120: (o) => view.getInt8(o) }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get(base + k * stride + c * T.BYTES_PER_ELEMENT);
  return out;
}

/** GLB mínimo: varias primitivas (posición, normal, índices) con un color y un metalizado cada una. */
function glb(parts) {
  const chunks = [], views = [], accessors = [], prims = [], materials = [];
  let off = 0;
  const push = (arr, target) => { const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const pad = (4 - (buf.length % 4)) % 4; chunks.push(buf, Buffer.alloc(pad)); views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target }); off += buf.length + pad; return views.length - 1; };
  for (const p of parts) {
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.pos.length; i += 3) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], p.pos[i + c]); max[c] = Math.max(max[c], p.pos[i + c]); }
    const vp = push(p.pos, 34962), vn = push(p.nor, 34962), vi = push(p.idx, 34963);
    accessors.push({ bufferView: vp, componentType: 5126, count: p.pos.length / 3, type: 'VEC3', min, max }, { bufferView: vn, componentType: 5126, count: p.nor.length / 3, type: 'VEC3' }, { bufferView: vi, componentType: 5125, count: p.idx.length, type: 'SCALAR' });
    materials.push({ name: p.name, pbrMetallicRoughness: { baseColorFactor: p.color, metallicFactor: p.metal, roughnessFactor: p.rough } });
    prims.push({ attributes: { POSITION: accessors.length - 3, NORMAL: accessors.length - 2 }, indices: accessors.length - 1, material: materials.length - 1 });
  }
  const json = { asset: { version: '2.0', generator: 'vertice/tools/balas' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: prims }], materials, accessors, bufferViews: views, buffers: [{ byteLength: off }] };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(chunks);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length, 0); h1.writeUInt32LE(0x4e4f534a, 4);
  const h2 = Buffer.alloc(8); h2.writeUInt32LE(bin.length, 0); h2.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, h1, js, h2, bin]);
}

function convert(bundle) {
  mkdirSync(OUT, { recursive: true });
  const manifest = {};
  for (const [id, [dir, base]] of Object.entries(CALIBRES)) {
    const file = join(bundle, dir, 'glTF', `${base}_Round_LOD1.gltf`);
    if (!existsSync(file)) { console.warn('[balas] falta', file); continue; }
    const g = JSON.parse(readFileSync(file, 'utf8'));
    const bin = readFileSync(join(dirname(file), g.buffers[0].uri));
    const bullet = [], casing = [];
    let zmin = Infinity, zmax = -Infinity;
    for (const pr of g.meshes[0].primitives) {
      const mat = g.materials[pr.material] ?? {};
      const name = mat.name ?? '';
      const pos = Float32Array.from(read(g, bin, pr.attributes.POSITION)), nor = Float32Array.from(read(g, bin, pr.attributes.NORMAL)), idx = Uint32Array.from(read(g, bin, pr.indices));
      const col = mat.pbrMetallicRoughness?.baseColorFactor ?? (/Polymer/.test(name) ? [0.62, 0.08, 0.06, 1] : /Headstamp/.test(name) ? [0.54, 0.365, 0.13, 1] : [0.5, 0.5, 0.5, 1]);
      const part = { name, pos, nor, idx, color: col, metal: /Polymer|Dirt/.test(name) ? 0 : 0.85, rough: /Polymer/.test(name) ? 0.6 : 0.35 };
      for (let i = 2; i < pos.length; i += 3) { zmin = Math.min(zmin, pos[i]); zmax = Math.max(zmax, pos[i]); }
      (/Jacket|Lead_Tip/.test(name) ? bullet : casing).push(part);
    }
    const out = { length: +(zmax - zmin).toFixed(5) };
    if (bullet.length) { writeFileSync(join(OUT, `${id}-bala.glb`), glb(bullet)); out.bala = `${id}-bala.glb`; }
    if (casing.length) { writeFileSync(join(OUT, `${id}-vaina.glb`), glb(casing)); out.vaina = `${id}-vaina.glb`; }
    manifest[id] = out;
    console.log(`[balas] ${id}: bala ${bullet.length ? 'sí' : '—'} · vaina ${casing.length ? 'sí' : '—'}`);
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ origen: 'FIELDWORK P05 Ammo Bundle v1.1 · CuiGames (https://cuigames.itch.io)', calibres: manifest }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const zi = process.argv.indexOf('--zip');
  if (zi > 0) {
    const tmp = mkdtempSync(join(tmpdir(), 'balas-'));
    execFileSync('unzip', ['-q', '-o', process.argv[zi + 1], '*_Round_LOD1.gltf', '*_Round_LOD1.bin', '-d', tmp]);
    convert(join(tmp, 'FIELDWORK_P05_Ammo_Bundle'));
    rmSync(tmp, { recursive: true, force: true });
  } else if (process.argv[2]) convert(process.argv[2]);
  else { console.error('Uso: node tools/balas/extraer.mjs <carpeta> | --zip <archivo.zip>'); process.exit(1); }
}
export { convert };
