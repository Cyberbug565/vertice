import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Carga .env de la raíz si existe (sin dependencias). Las variables ya definidas tienen prioridad. */
function loadDotEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export interface Config {
  port: number; host: string; databaseUrl?: string; pgliteDir: string; staticDir: string;
  ambientNpcs: number; crowdNpcs: number; crowdAt: [number, number]; adminToken: string; cityHourOffset: number;
  lingerSeconds: number; viewRadius: number; seed: number; logLevel: 'info' | 'warn'; speedScale: number; needsScale: number; downedSeconds?: number; jobTimeScale: number; cityHourMs?: number;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  loadDotEnv();
  const e = process.env;
  const crowd = (e.CROWD_AT ?? '21,34').split(',').map(Number) as [number, number];
  return {
    port: Number(e.PORT ?? 8080),
    host: e.HOST ?? '0.0.0.0',
    databaseUrl: e.DATABASE_URL || undefined,
    pgliteDir: e.PGLITE_DIR ?? join(ROOT, 'data/pglite'),
    staticDir: e.STATIC_DIR ?? join(ROOT, 'client/dist'),
    ambientNpcs: Number(e.AMBIENT_NPCS ?? 48),
    crowdNpcs: Number(e.CROWD_NPCS ?? 0),
    crowdAt: crowd,
    adminToken: e.ADMIN_TOKEN ?? 'dev-admin',
    cityHourOffset: Number(e.CITY_HOUR_OFFSET ?? 0),
    lingerSeconds: Number(e.LINGER_SECONDS ?? 10),
    viewRadius: Number(e.VIEW_RADIUS ?? 22),
    seed: Number(e.WORLD_SEED ?? 1337),
    logLevel: (e.LOG_LEVEL as 'info' | 'warn') ?? 'info',
    speedScale: Number(e.SPEED_SCALE ?? 1), // solo para pruebas automatizadas
    cityHourMs: e.CITY_HOUR_MS ? Number(e.CITY_HOUR_MS) : undefined, // duración de una hora de juego (por defecto, la del contenido)
    needsScale: Number(e.NEEDS_SCALE ?? 1), // acelera hambre, sed y sueño (pruebas)
    downedSeconds: e.DOWNED_SECONDS ? Number(e.DOWNED_SECONDS) : undefined,
    jobTimeScale: Number(e.JOB_TIME_SCALE ?? 1),
    ...overrides,
  };
}
