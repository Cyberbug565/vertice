import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from './db/db.js';

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
const SESSION_DAYS = 30;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, s, k] = stored.split('$');
  const key = await scrypt(pw, Buffer.from(s, 'base64'), 32);
  const ref = Buffer.from(k, 'base64');
  return ref.length === key.length && timingSafeEqual(ref, key);
}
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

export function validateCredentials(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_.-]{3,24}$/.test(username)) return 'El usuario debe tener 3–24 caracteres (letras, números, _ . -)';
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) return 'La contraseña debe tener al menos 6 caracteres';
  return null;
}

export async function register(db: Db, username: string, password: string) {
  const id = randomUUID();
  try {
    await db.query('INSERT INTO accounts (id, username, pass_hash) VALUES ($1,$2,$3)', [id, username, await hashPassword(password)]);
  } catch (e: any) {
    if (String(e.code) === '23505' || /unique|duplicate/i.test(e.message)) return { error: 'Ese usuario ya existe' } as const;
    throw e;
  }
  return { token: await createSession(db, id), accountId: id } as const;
}

export async function login(db: Db, username: string, password: string) {
  const r = await db.query<{ id: string; pass_hash: string }>('SELECT id, pass_hash FROM accounts WHERE lower(username) = lower($1)', [username]);
  if (!r.rows[0] || !(await verifyPassword(password, r.rows[0].pass_hash))) return { error: 'Usuario o contraseña incorrectos' } as const;
  return { token: await createSession(db, r.rows[0].id), accountId: r.rows[0].id } as const;
}

async function createSession(db: Db, accountId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query(`INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha(token), accountId]);
  return token;
}

export async function resolveToken(db: Db, token: string | undefined | null): Promise<{ accountId: string; username: string } | null> {
  if (!token || token.length < 10 || token.length > 200) return null;
  const r = await db.query<{ account_id: string; username: string }>(
    'SELECT s.account_id, a.username FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = $1 AND s.expires_at > now()', [sha(token)]);
  return r.rows[0] ? { accountId: r.rows[0].account_id, username: r.rows[0].username } : null;
}
