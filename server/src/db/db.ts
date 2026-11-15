// Adaptador de base de datos: PostgreSQL (DATABASE_URL) o PGlite embebido (PostgreSQL en WASM) para desarrollo sin instalación.
import pg from 'pg';
import { mkdirSync } from 'node:fs';

export interface Queryable { query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }
export interface Db extends Queryable {
  kind: 'postgres' | 'pglite';
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDb(url: string | undefined, pgliteDir: string): Promise<Db> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    pool.on('error', (e) => console.error('[db] error de conexión', e.message));
    await pool.query('SELECT 1');
    return {
      kind: 'postgres',
      query: (sql, params) => pool.query(sql, params as any[]) as any,
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn({ query: (s, p) => c.query(s, p as any[]) as any });
          await c.query('COMMIT');
          return r;
        } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
      },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  if (pgliteDir !== 'memory://') mkdirSync(pgliteDir, { recursive: true });
  const db = new PGlite(pgliteDir === 'memory://' ? undefined : pgliteDir);
  await db.waitReady;
  return {
    kind: 'pglite',
    query: (sql, params) => db.query(sql, params as any[]) as any,
    tx: (fn) => db.transaction((t) => fn({ query: (s, p) => t.query(s, p as any[]) as any })),
    close: () => db.close(),
  };
}
