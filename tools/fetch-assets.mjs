// v0.17 · Descarga los modelos extra (Tormenta/Ophiel, colección de peinados y piezas del samurái) desde la release
// «modelos-extra-v17» de GitHub y los deja en client/public/models/extra. No van en el repositorio porque la licencia de
// los originales no está confirmada. Si no se pueden bajar, el juego funciona igual sin ellos (la Tormenta se ve con su
// versión de placas y el creador no ofrece la colección de peinados).
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
