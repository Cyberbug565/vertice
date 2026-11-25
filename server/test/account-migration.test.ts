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
      VALUES ($1,$2,'Vida anterior','callejero','solo','{}','{}','{"model":"ejecutiva","body":"femenino","hair":"#432113"}',50,50,5,50,'bloque9',4.5,5.5,'anterior','anterior',1234)`, [char, account]);
    const right = randomUUID(), left = randomUUID(), kept = randomUUID(), loose = randomUUID();
    await db.query(`INSERT INTO cyberware_instances(id, character_id, def_id, location, part, created_at) VALUES
      ($1,$5,'brazo-protesico','installed',NULL,'2024-01-01'), ($2,$5,'brazo-estabilizador','installed',NULL,'2024-02-01'),
      ($3,$5,'pierna-protesica','installed','pierna_izq','2024-01-01'), ($4,$5,'pierna-protesica','inventory',NULL,'2024-01-01')`, [right,left,kept,loose,char]);
    expect(await migrate(db, false)).toEqual(['011_cuentas_expedientes.sql', '012_lados_ciberware.sql', '013_atlas.sql', '014_casinos.sql', '015_penal.sql', '016_cuerpos_personalizables.sql', '017_comercios.sql']);
    const parts = await db.query<{ id: string; part: string | null }>('SELECT id,part FROM cyberware_instances WHERE character_id=$1', [char]);
    expect(Object.fromEntries(parts.rows.map((x) => [x.id,x.part]))).toEqual({ [right]:'brazo_der', [left]:'brazo_izq', [kept]:'pierna_izq', [loose]:null });
    expect(await selectedCharacterId(db, account)).toBe(char);
    const r = (await db.query<any>('SELECT c.name,c.money,c.appearance,a.pass_hash FROM characters c JOIN accounts a ON a.id=c.account_id WHERE c.id=$1', [char])).rows[0];
    expect(r).toMatchObject({ name: 'Vida anterior', pass_hash: 'hash-anterior' }); expect(Number(r.money)).toBe(1234);
    expect(r.appearance).toEqual({body:'femenino',hair:'#432113'});
    expect((await db.query('SELECT 1 FROM casino_hands WHERE character_id=$1',[char])).rows).toEqual([]);
    expect((await db.query('SELECT 1 FROM casino_receipts WHERE character_id=$1',[char])).rows).toEqual([]);
    expect((await db.query('SELECT restock_at,calls_spent FROM business_reserves')).rows).toEqual([]);
    expect(await migrate(db, false)).toEqual([]);
  } finally { await db.close(); }
});
