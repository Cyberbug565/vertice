import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { selectedCharacterId } from '../src/game/accounts.js';

it('la migración conserva una cuenta y su personaje de v0.22 y se aplica una sola vez', async () => {
  const db = await openDb(undefined, 'memory://');
  const dir = new URL('../src/db/migrations/', import.meta.url);
  try {
    await db.query('CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql') && f < '011').sort()) {
      for (const s of readFileSync(new URL(f, dir), 'utf8').split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.query(s);
      await db.query('INSERT INTO schema_migrations (id) VALUES ($1)', [f]);
    }
    const account = randomUUID(), char = randomUUID();
    await db.query("INSERT INTO accounts (id,username,pass_hash) VALUES ($1,'CuentaAnterior','hash-anterior')", [account]);
    await db.query(`INSERT INTO characters (id,account_id,name,origin,role,attributes,skills,appearance,hp,stamina,luck,humanity,zone_id,pos_x,pos_y,rules_version,content_version,money)
      VALUES ($1,$2,'Vida anterior','callejero','solo','{}','{}','{}',50,50,5,50,'bloque9',4.5,5.5,'anterior','anterior',1234)`, [char, account]);
    expect(await migrate(db, false)).toEqual(['011_cuentas_expedientes.sql']);
    expect(await selectedCharacterId(db, account)).toBe(char);
    const r = (await db.query<any>('SELECT c.name,c.money,a.pass_hash FROM characters c JOIN accounts a ON a.id=c.account_id WHERE c.id=$1', [char])).rows[0];
    expect(r).toMatchObject({ name: 'Vida anterior', pass_hash: 'hash-anterior' }); expect(Number(r.money)).toBe(1234);
    expect(await migrate(db, false)).toEqual([]);
  } finally { await db.close(); }
});
