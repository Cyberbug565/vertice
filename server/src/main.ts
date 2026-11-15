import { createApp } from './app.js';

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
