// v0.17 · Descarga los modelos extra (Tormenta/Ophiel, colección de peinados y piezas del samurái) desde la release
// «modelos-extra-v17» de GitHub y los deja en client/public/models/extra. No van en el repositorio porque la licencia de
// los originales no está confirmada. Si no se pueden bajar, el juego funciona igual sin ellos (la Tormenta se ve con su
// versión de placas y el creador no ofrece la colección de peinados).
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'client', 'public', 'models');
const marker = join(dest, 'extra', 'tormenta.glb');
// v0.19 · Se busca en varias releases (la primera que lo tenga): modelos-extra-v17 o la de «armaduras».
const URLS = process.env.VERTICE_EXTRA_URL ? [process.env.VERTICE_EXTRA_URL] : [
  'https://github.com/Cyberbug565/vertice/releases/download/modelos-extra-v17/vertice-extra-v17.tar.gz',
  'https://github.com/Cyberbug565/vertice/releases/download/armaduras/vertice-extra-v17.tar.gz',
];

await fetchMedieval();
if (existsSync(marker) && !process.argv.includes('--force')) { console.log('[recursos] modelos extra ya presentes'); process.exit(0); }
try {
  let res = null;
  for (const u of URLS) {
    console.log('[recursos] descargando', u);
    const r = await fetch(u, { redirect: 'follow' }).catch(() => null);
    if (r?.ok) { res = r; break; }
    console.log('[recursos]  no está ahí', r ? `(HTTP ${r.status})` : '');
  }
  if (!res) throw new Error('el paquete no está en ninguna release');
  const tmp = join(root, '.vertice-extra.tar.gz');
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  mkdirSync(dest, { recursive: true });
  execFileSync('tar', ['-xzf', tmp, '-C', dest]);
  rmSync(tmp);
  console.log('[recursos] modelos extra listos en', join(dest, 'extra'));
} catch (err) {
  console.warn('[recursos] no se pudo descargar el paquete completo:', err.message);
  // v0.20 · Plan B: el modelo de la Tormenta suelto (tormenta.glb, 3,7 MB) en la release «armaduras» o «modelos-extra-v17».
  for (const tag of ['armaduras', 'modelos-extra-v17']) {
    const u = `https://github.com/Cyberbug565/vertice/releases/download/${tag}/tormenta.glb`;
    const r = await fetch(u, { redirect: 'follow' }).catch(() => null);
    if (!r?.ok) continue;
    mkdirSync(join(dest, 'extra'), { recursive: true });
    writeFileSync(marker, Buffer.from(await r.arrayBuffer()));
    console.log('[recursos] Tormenta descargada de', u);
    break;
  }
  if (!existsSync(marker)) console.warn('[recursos] sin modelos extra: el juego funciona igual (la Tormenta se ve con su versión de placas).');
}

// v0.21 · Personajes medievales de pocos polígonos (CraftPix): se bajan del zip de la release «moveset» (su licencia no
// permite redistribuirlos en el repositorio). Solo se extraen los FBX «people_unity» y la textura de paleta.
async function fetchMedieval() {
  const out = join(dest, 'extra', 'medieval');
  if (existsSync(join(out, 'people_texture_map.png')) && !process.argv.includes('--force')) return;
  const u = 'https://github.com/Cyberbug565/vertice/releases/download/moveset/Free.Medieval.3D.People.Low.Poly.Pack.zip';
  try {
    const r = await fetch(u, { redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const zip = Buffer.from(await r.arrayBuffer());
    mkdirSync(out, { recursive: true });
    let n = 0;
    for (const f of unzipEntries(zip)) {
      const base = f.name.split('/').pop();
      if (/people_unity\/[^/]+\.fbx$/i.test(f.name) || base === 'people_texture_map.png') { writeFileSync(join(out, base), f.data()); n++; }
    }
    console.log(`[recursos] personajes medievales: ${n} archivos en`, out);
  } catch (err) { console.warn('[recursos] sin personajes medievales (el juego usa el cuerpo personalizable en su lugar):', err.message); }
}
/** Lector mínimo de ZIP (directorio central + «deflate» o sin comprimir). */
function* unzipEntries(b) {
  let eocd = b.length - 22;
  while (eocd >= 0 && b.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip no válido');
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nlen = b.readUInt16LE(p + 28), xlen = b.readUInt16LE(p + 30), clen = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const lstart = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
    const raw = b.subarray(lstart, lstart + csize);
    yield { name, data: () => (method === 8 ? inflateRawSync(raw) : Buffer.from(raw)) };
  }
}
