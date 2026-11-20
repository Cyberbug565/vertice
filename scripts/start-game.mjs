// Cloudflare transporta el mismo HTTP + WebSocket que se prueba en local.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { launchConfig } from './launch-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
export async function launchGame({ publish }) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 12) throw new Error(`Necesitas Node.js 22.12 o superior. Tienes ${process.versions.node}.`);
  const cfg = launchConfig(ROOT, publish);
  const { env, port } = cfg;
  const origin = `http://127.0.0.1:${port}`;
  const cf = env.CLOUDFLARED || 'cloudflared';
  const children = new Set();
  let server, stopping = false;
  const stateDir = join(ROOT, 'data');
  const stateFile = join(stateDir, publish ? 'publicacion.json' : 'local.json');
  const state = { mode: publish ? 'public' : 'local', localUrl: origin, publicUrl: null, startedAt: new Date().toISOString(), running: false };
  const saveState = () => { mkdirSync(stateDir, { recursive: true }); writeFileSync(stateFile, JSON.stringify(state, null, 2)); };
  const child = (cmd, args, opts = {}) => {
    const c = spawn(cmd, args, { cwd: ROOT, env, stdio: 'inherit', ...opts });
    children.add(c); c.once('exit', () => children.delete(c));
    return c;
  };
  const done = (c) => new Promise((resolve, reject) => { c.once('error', reject); c.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`El proceso terminó con ${signal ?? code}.`))); });
  const stop = async (code = 0) => {
    if (stopping) return; stopping = true;
    console.log('\nCerrando Vértice y guardando personajes…');
    const running = [...children];
    const exits = running.map((c) => new Promise((r) => { c.once('exit', r); c.once('error', r); }));
    for (const c of running) {
      // IPC permite un guardado ordenado también en Windows, donde kill() puede ser forzoso.
      if (c === server && c.connected) c.send({ t: 'shutdown' }); else c.kill('SIGINT');
    }
    const force = setTimeout(() => {
      for (const c of children) { if (WIN) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); else c.kill('SIGKILL'); }
    }, 15000);
    await Promise.all(exits); clearTimeout(force);
    state.running = false; state.stoppedAt = new Date().toISOString(); saveState();
    process.exitCode = code;
  };
  process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
  try {
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', () => reject(new Error(`El puerto ${port} está ocupado. Cierra la otra ventana de Vértice o cambia ${publish ? 'PORT' : 'LOCAL_PORT'} en .env.`)));
      probe.listen(port, '127.0.0.1', () => probe.close(resolve));
    });
    if (publish && spawnSync(cf, ['--version'], { shell: WIN, stdio: 'ignore', env }).status !== 0)
      throw new Error('No encuentro cloudflared. Instálalo para publicar. Para probar sin Cloudflare usa iniciar-local.bat o npm run local.');
    const npm = (args) => child('npm', args, { shell: WIN });
    if (!existsSync(join(ROOT, 'node_modules/tsx'))) { console.log('Instalando dependencias…'); await done(npm(['ci'])); }
    if (stopping) return;
    console.log('Compilando la versión actual del juego…');
    // Nunca reutilizar dist de una actualización anterior.
    await done(npm(['run', 'build']));
    if (stopping) return;
    console.log(`\nIniciando ${publish ? 'publicación' : 'prueba local'}…`);
    console.log(cfg.databaseUrl ? 'Guardado: PostgreSQL configurado para este modo.' : `Guardado persistente: ${cfg.storage}`);
    server = child(process.execPath, ['--import', 'tsx', 'server/src/main.ts'], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    let failed;
    server.once('error', (err) => { failed = err; });
    server.once('exit', (code) => { failed = new Error(`El servidor se ha detenido (${code}). Revisa el mensaje anterior.`); if (state.running && !stopping) { console.error(failed.message); void stop(1); } });
    let ready = false;
    for (let i = 0; i < 90 && !stopping; i++) {
      if (failed) throw failed;
      try { const r = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1500) }); const health = await r.json(); ready = r.ok && health.ok && health.service === 'vertice'; } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (stopping) return;
    if (!ready) throw new Error('El servidor no llegó a estar listo. Revisa la base de datos y el puerto.');
    state.running = true; saveState();
    console.log(`\nVértice listo en ${origin}\nMantén esta ventana abierta. Ctrl+C guarda y cierra.\n`);
    if (!process.argv.includes('--no-open')) {
      const cmd = WIN ? 'rundll32' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      const args = WIN ? ['url.dll,FileProtocolHandler', origin] : [origin];
      const opener = spawn(cmd, args, { stdio: 'ignore' }); opener.on('error', () => {}); opener.unref();
    }
    if (!publish) return;
    const tunnel = child(cf, ['tunnel', '--no-autoupdate', '--url', origin], { shell: WIN, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', shown = false;
    const watchdog = setTimeout(() => { if (!shown && !stopping) { console.error('Cloudflare no ha entregado un enlace. Revisa la conexión a internet y vuelve a publicar.'); void stop(1); } }, 60000);
    const onOutput = (d) => {
      output = (output + d.toString()).slice(-4000);
      const m = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !shown) { shown = true; clearTimeout(watchdog); state.publicUrl = m[0]; saveState(); console.log(`\nENLACE PÚBLICO NUEVO: ${m[0]}\nEl enlace anterior deja de servir al cerrar el túnel. Comparte este enlace actual.\n`); }
      if (/error|ERR/.test(d.toString())) process.stderr.write(`[Cloudflare] ${d}`);
    };
    tunnel.stdout.on('data', onOutput); tunnel.stderr.on('data', onOutput);
    tunnel.once('error', (err) => { clearTimeout(watchdog); console.error(`No se pudo abrir el túnel: ${err.message}`); void stop(1); });
    tunnel.once('exit', (code) => { clearTimeout(watchdog); if (!stopping) { console.error(`El túnel se ha cerrado (${code}). Vuelve a publicar para obtener un enlace nuevo.`); void stop(1); } });
  } catch (err) { console.error(`\nNo se pudo iniciar: ${err.message}`); await stop(1); }
}
