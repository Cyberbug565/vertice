// La selección pertenece a la cuenta en la base de datos, nunca al almacenamiento del navegador.
import type { CharacterSummary } from '@vertice/shared';
import type { Db, Queryable } from '../db/db.js';

export async function characterRoster(db: Queryable, accountId: string): Promise<CharacterSummary[]> {
  return (await db.query<CharacterSummary>(`SELECT id, name, status, role, origin, level, money, zone_id, profession, created_at
    FROM characters WHERE account_id=$1 AND status <> 'dead' ORDER BY created_at DESC, id`, [accountId])).rows.map((r) => ({ ...r, money: Number(r.money) }));
}

export async function selectedCharacterId(db: Queryable, accountId: string): Promise<string | null> {
  const r = await db.query<{ id: string }>(`SELECT c.id FROM characters c JOIN accounts a ON a.id=c.account_id
    WHERE a.id=$1 AND c.status <> 'dead'
    ORDER BY (c.id=a.selected_character_id) DESC NULLS LAST, c.created_at DESC, c.id LIMIT 1`, [accountId]);
  return r.rows[0]?.id ?? null;
}

export async function selectCharacter(db: Db, accountId: string, characterId: unknown): Promise<boolean> {
  if (typeof characterId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(characterId)) return false;
  const r = await db.query(`UPDATE accounts a SET selected_character_id=c.id FROM characters c
    WHERE a.id=$1 AND c.id=$2 AND c.account_id=a.id AND c.status <> 'dead' RETURNING a.id`, [accountId, characterId]);
  return r.rows.length > 0;
}
