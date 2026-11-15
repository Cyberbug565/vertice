import { loadConfig } from '../config.js';
import { openDb } from './db.js';
import { migrate } from './migrate.js';

const cfg = loadConfig();
const db = await openDb(cfg.databaseUrl, cfg.pgliteDir);
const applied = await migrate(db);
console.log(applied.length ? `Aplicadas ${applied.length} migraciones (${db.kind}).` : `Base de datos al día (${db.kind}).`);
await db.close();
