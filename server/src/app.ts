// Composición del servidor: contenido validado → base de datos → mundo → transporte.
import { loadConfig, type Config } from './config.js';
import { openDb } from './db/db.js';
import { migrate } from './db/migrate.js';
import { loadValidatedContent } from './content.js';
import { Metrics } from './metrics.js';
import { World } from './world/world.js';
import { startServer } from './net/server.js';

export async function createApp(overrides: Partial<Config> = {}) {
  const cfg = loadConfig(overrides);
  const { content, hash } = loadValidatedContent();
  if (cfg.cityHourMs) (content.manifest as { cityHourMs: number }).cityHourMs = cfg.cityHourMs;
  const db = await openDb(cfg.databaseUrl, cfg.pgliteDir);
  await migrate(db, cfg.logLevel === 'info');
  const metrics = new Metrics();
  const world = new World(content, hash, db, cfg, metrics);
  await world.init();
  world.start();
  const srv = await startServer(cfg, db, world, metrics);
  return {
    cfg, db, world, metrics, port: srv.port, contentHash: hash,
    async close() { await srv.close(); await world.shutdown(); await db.close(); },
  };
}
