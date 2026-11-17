import { createApp } from './app.js';

// v0.12 · Un error asíncrono suelto (una consulta rechazada, un mensaje raro) se registra y el mundo sigue en marcha:
// antes tiraba el proceso entero y desconectaba a todos.
process.on('unhandledRejection', (err) => { console.error('[sin capturar]', err instanceof Error ? err.stack ?? err.message : err); });
process.on('uncaughtException', (err) => { console.error('[excepción]', err.stack ?? err.message); });
const app = await createApp();
console.log(`[vertice] servidor en http://localhost:${app.port}  (db: ${app.db.kind}, contenido ${app.contentHash}, PNJ ambientales ${app.cfg.ambientNpcs}, multitud ${app.cfg.crowdNpcs})`);
let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    if (closing) return; closing = true;
    console.log('[vertice] cerrando: guardando personajes…');
    await app.close();
    process.exit(0);
  });
}
