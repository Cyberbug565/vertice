import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// El lanzador es Node sin compilación para que el doble clic funcione antes de npm ci.
// @ts-ignore módulo JavaScript sin declaraciones
import { launchConfig } from '../../scripts/launch-config.mjs';

describe('iniciar local y publicar', () => {
  const root = '/tmp/vertice-launch-test';
  it('las pruebas locales no conectan por accidente a una base de producción', () => {
    const cfg = launchConfig(root, false, { DATABASE_URL: 'postgres://production/example', PGLITE_DIR: '/production/data', PORT: '9000' });
    expect(cfg.databaseUrl).toBe(''); expect(cfg.storage).toBe(`${root}/data/local/pglite`);
    expect(cfg.env.HOST).toBe('127.0.0.1'); expect(cfg.env.TRUST_PROXY).toBe('false'); expect(cfg.port).toBe(8080);
  });
  it('publicar conserva la base existente y configura el proxy', () => {
    const cfg = launchConfig(root, true, { DATABASE_URL: 'postgres://production/example', PGLITE_DIR: '/production/data', PORT: '9000' });
    expect(cfg.databaseUrl).toBe('postgres://production/example'); expect(cfg.storage).toBe('/production/data');
    expect(cfg.port).toBe(9000); expect(cfg.env.TRUST_PROXY).toBe('true');
  });
  it('ambos modos pueden usar PostgreSQL explícito y los puertos de .env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vertice-launch-'));
    try {
      writeFileSync(join(dir, '.env'), 'PORT=8123\nLOCAL_PORT=8124\nLOCAL_DATABASE_URL=postgres://test/example\n');
      expect(launchConfig(dir, false, {}).port).toBe(8124); expect(launchConfig(dir, true, {}).port).toBe(8123);
      expect(launchConfig(dir, false, {}).databaseUrl).toBe('postgres://test/example');
      expect(launchConfig(dir, false, { LOCAL_PORT: '8125' }).port).toBe(8125);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('rechaza puertos inválidos antes de iniciar procesos', () => {
    for (const LOCAL_PORT of ['0', '-1', 'no', '70000']) expect(() => launchConfig(root, false, { LOCAL_PORT })).toThrow(/puerto/);
  });
});
