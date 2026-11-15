import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(db: Db, log = true): Promise<string[]> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ id: string }>('SELECT id FROM schema_migrations')).rows.map((r) => r.id));
  const applied: string[] = [];
  for (const f of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(DIR, f), 'utf8');
    await db.tx(async (q) => {
      for (const stmt of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await q.query(stmt);
      await q.query('INSERT INTO schema_migrations (id) VALUES ($1)', [f]);
    });
    applied.push(f);
    if (log) console.log(`[db] migración aplicada: ${f}`);
  }
  return applied;
}
