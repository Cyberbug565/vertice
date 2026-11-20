import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export function launchConfig(root, publish, inherited = process.env) {
  const env = { ...inherited };
  const path = join(root, '.env');
  if (existsSync(path)) for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const port = Number((publish ? env.PORT : env.LOCAL_PORT) || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('El puerto debe ser un número entre 1 y 65535. Revisa PORT / LOCAL_PORT en .env.');
  // El mismo servidor en ambos modos; las pruebas locales usan su propia base por defecto.
  const storage = (publish ? env.PGLITE_DIR : env.LOCAL_PGLITE_DIR) || (publish ? 'data/pglite' : 'data/local/pglite');
  const databaseUrl = (publish ? env.DATABASE_URL : env.LOCAL_DATABASE_URL) || '';
  return { port, databaseUrl, storage: isAbsolute(storage) ? storage : resolve(root, storage), env: {
    ...env, PORT: String(port), HOST: '127.0.0.1', DATABASE_URL: databaseUrl,
    PGLITE_DIR: isAbsolute(storage) ? storage : resolve(root, storage),
    TRUST_PROXY: publish ? 'true' : 'false', VERTICE_MODE: publish ? 'public' : 'local',
  } };
}
