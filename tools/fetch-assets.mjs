// v0.17 · Descarga los modelos extra (Tormenta/Ophiel, colección de peinados y piezas del samurái) desde la release
// «modelos-extra-v17» de GitHub y los deja en client/public/models/extra. No van en el repositorio porque la licencia de
// los originales no está confirmada. Si no se pueden bajar, el juego funciona igual sin ellos (se ve al piloto en lugar
// de la Tormenta y el creador no ofrece la colección de peinados).
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'client', 'public', 'models');
const marker = join(dest, 'extra', 'tormenta.glb');
const URL_PKG = process.env.VERTICE_EXTRA_URL ?? 'https://github.com/Cyberbug565/vertice/releases/download/modelos-extra-v17/vertice-extra-v17.tar.gz';

if (existsSync(marker) && !process.argv.includes('--force')) { console.log('[recursos] modelos extra ya presentes'); process.exit(0); }
try {
  console.log('[recursos] descargando', URL_PKG);
  const res = await fetch(URL_PKG, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tmp = join(root, '.vertice-extra.tar.gz');
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  mkdirSync(dest, { recursive: true });
  execFileSync('tar', ['-xzf', tmp, '-C', dest]);
  rmSync(tmp);
  console.log('[recursos] modelos extra listos en', join(dest, 'extra'));
} catch (err) {
  console.warn('[recursos] no se pudieron descargar los modelos extra (el juego funciona sin ellos):', err.message);
}
