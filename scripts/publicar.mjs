// Publica el juego desde tu ordenador con un túnel gratuito de Cloudflare (sin cuenta).
// Uso: npm run publicar   (o doble clic en publicar.bat en Windows / publicar.command en macOS)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8080);
const WIN = process.platform === 'win32';
const CLOUDFLARED = process.env.CLOUDFLARED ?? 'cloudflared';
const children = [];
let stopping = false;
let server = null;

const say = (s = '') => console.log(s);
function run(cmd, args, label) {
  say(`\n▶ ${label}…`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: WIN });
  if (r.status !== 0) { say(`✘ Falló: ${label}`); process.exit(1); }
}
function stopAll(code = 0) {
  for (const c of children) { try { c.kill('SIGINT'); } catch {} }
  // Espera a que el servidor guarde; si no termina en 8 s, se fuerza.
  const t = setTimeout(() => { for (const c of children) { try { WIN ? spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F']) : c.kill('SIGKILL'); } catch {} } process.exit(code); }, 8000);
  if (!server || server.exitCode !== null) { clearTimeout(t); setTimeout(() => process.exit(code), 300); return; }
  server.once('exit', () => { clearTimeout(t); process.exit(code); });
}
process.on('SIGINT', () => { if (stopping) return; stopping = true; say('\nCerrando el túnel y guardando personajes…'); stopAll(0); });

// 1) Requisitos
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) { say(`Necesitas Node.js 22.12 o superior (tienes ${process.versions.node}). Descárgalo en https://nodejs.org`); process.exit(1); }
const cf = spawnSync(CLOUDFLARED, ['--version'], { shell: WIN, encoding: 'utf8' });
if (cf.status !== 0) {
  say('Falta cloudflared (el programa gratuito de Cloudflare que crea el túnel). Instálalo y vuelve a ejecutar:');
  say('  Windows:  winget install --id Cloudflare.cloudflared');
  say('  macOS:    brew install cloudflared');
  say('  Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
  process.exit(1);
}

// 2) Dependencias y compilación del cliente (solo la primera vez)
if (!existsSync(join(ROOT, 'node_modules'))) run('npm', ['ci'], 'Instalando dependencias (solo la primera vez)');
if (!existsSync(join(ROOT, 'client/dist/index.html'))) run('npm', ['run', 'build'], 'Compilando el juego');

// 3) Servidor del juego
say('\n▶ Arrancando el servidor del juego…');
// Node directo (sin npx) para que Ctrl+C llegue al servidor y guarde a los personajes antes de salir.
server = spawn(process.execPath, ['--import', 'tsx', 'server/src/main.ts'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(PORT), TRUST_PROXY: 'true' } });
children.push(server);
server.stdout.on('data', (d) => process.stdout.write(`  [servidor] ${d}`));
server.stderr.on('data', (d) => process.stdout.write(`  [servidor] ${d}`));
server.on('exit', (code) => { if (!stopping) { stopping = true; say(`El servidor se ha detenido (código ${code}).`); stopAll(code ?? 1); } });

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  try { ready = (await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok; } catch {}
  if (!ready) await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) { say('✘ El servidor no respondió en 60 s.'); stopAll(1); }

// 4) Túnel de Cloudflare
say('\n▶ Abriendo el túnel de Cloudflare…');
const tunnel = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { cwd: ROOT, shell: WIN, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(tunnel);
let shown = false;
const onOut = (d) => {
  const text = d.toString();
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !shown) {
    shown = true;
    say('\n' + '═'.repeat(64));
    say('  ¡Vértice está en internet! Comparte este enlace:');
    say(`\n     ${m[0]}\n`);
    say('  Mientras esta ventana siga abierta, cualquiera puede jugar.');
    say('  Para cerrarlo: Ctrl+C (los personajes se guardan).');
    say('═'.repeat(64) + '\n');
  }
  if (/error|ERR/.test(text) && !shown) process.stdout.write(`  [túnel] ${text}`);
};
tunnel.stdout.on('data', onOut);
tunnel.stderr.on('data', onOut);
tunnel.on('exit', (code) => { if (!stopping) { stopping = true; say(`El túnel se ha cerrado (código ${code}).`); stopAll(code ?? 1); } });
