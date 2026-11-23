// v0.21 · Personajes cartoon (oficios y medievales), atuendos completos, la cuchilla serrada del orco como arma pesada y
// las animaciones de la librería universal.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { BODIES, TOPS, weaponSize, normalizeAppearance } from '@vertice/shared';

const DB = process.env.TEST_DATABASE_URL;
const look = { skin: '#c89070', hair: '#222222', jacket: '#40506a', accent: '#43f3ff' };
const pub = (p: string) => fileURLToPath(new URL(`../../client/public/${p}`, import.meta.url));
let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 60, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false });
});
afterAll(async () => { await app?.close(); });

describe('v0.21', () => {
  it('el aspecto solo conserva los cuerpos editables y omite el identificador de modelo anterior', () => {
    expect(BODIES).toEqual(['masculino', 'femenino']);
    const r = normalizeAppearance({ ...look, model: 'orco-gigante', body: 'femenino' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body).toBe('femenino');
      expect(r.value).not.toHaveProperty('model');
    }
    expect(existsSync(pub('models/cartoon'))).toBe(false);
  });

  it('atuendos completos de jornalero y explorador: ropa válida, a la venta y con sus modelos', () => {
    const c = app.world.c;
    for (const t of ['atuendo-campesino', 'atuendo-explorador']) {
      expect((TOPS as readonly string[]).includes(t)).toBe(true);
      expect(c.items.some((i) => i.id === t)).toBe(true);
      expect(c.shops.some((s) => (s.stock[t] ?? 0) > 0)).toBe(true);
      for (const k of ['masculino', 'femenino']) expect(statSync(pub(`models/atuendos/${k}-${t.replace('atuendo-', '')}.glb`)).size).toBeGreaterThan(100_000);
    }
  });

  it('la cuchilla serrada es un arma pesada cuerpo a cuerpo que se vende en la chatarrería y la forja', () => {
    const c = app.world.c;
    const it = c.items.find((i) => i.id === 'cuchilla-serrada')!;
    expect(it.weapon).toBeTruthy();
    expect(it.weapon!.range).toBeLessThan(3);
    expect(weaponSize(it)).toBe('grande'); // a dos manos, a la espalda
    expect(weaponSize(c.items.find((i) => i.id === 'mazo')!)).toBe('grande');
    for (const s of ['chatarreria-tomas', 'armas-forja']) expect(c.shops.find((x) => x.id === s)!.stock['cuchilla-serrada']).toBeGreaterThan(0);
  });

  it('los vecinos y la policía usan los dos cuerpos personalizables', () => {
    const all = [...app.world.entities.values()].filter(e => e.kind === 'npc' && e.appearance);
    expect(all.some(e => e.npcType === 'police')).toBe(true);
    expect(all.some(e => e.npcType === 'civil')).toBe(true);
    expect(all.every(e => !Object.hasOwn(e.appearance!, 'model'))).toBe(true);
  });

  it('la librería de animaciones viaja con el cliente', () => {
    expect(statSync(pub('models/anim/ual2.glb')).size).toBeGreaterThan(500_000);
  });
});
