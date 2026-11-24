// v0.40 · Si faltan los modelos de las balas (client/public/models/extra/balas), los genera a partir del paquete de la
// release «balasyarmas». Nunca hace fallar la compilación: sin ellos, el juego dibuja ojivas con las medidas reales.
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const marker = join(root, 'client', 'public', 'models', 'extra', 'balas', 'manifest.json');
const URL = process.env.VERTICE_BALAS_URL ?? 'https://github.com/Cyberbug565/vertice/releases/download/balasyarmas/FIELDWORK_P05_Ammo_Bundle_v1.1.zip';
if (existsSync(marker) && !process.argv.includes('--force')) { console.log('[balas] modelos ya presentes'); process.exit(0); }
try {
  console.log('[balas] descargando el paquete de munición (≈170 MB, solo la primera vez)…');
  const r = await fetch(URL, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const dir = mkdtempSync(join(tmpdir(), 'balas-')), zip = join(dir, 'municion.zip');
  writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  execFileSync(process.execPath, [join(root, 'tools', 'balas', 'extraer.mjs'), '--zip', zip], { stdio: 'inherit' });
  rmSync(dir, { recursive: true, force: true });
} catch (err) {
  console.warn('[balas] no se han podido generar los modelos:', err.message, '— el juego usará balas hechas con sus medidas reales.');
}
