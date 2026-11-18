// v0.21 · Personajes cartoon (oficios y medievales), atuendos completos, la cuchilla serrada del orco como arma pesada y
// las animaciones de la librería universal.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { CARTOON_MODELS, TOPS, weaponSize, normalizeAppearance } from '@vertice/shared';

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
  it('el modelo de personaje se valida: los del catálogo valen, uno inventado no', () => {
    for (const m of CARTOON_MODELS) expect(normalizeAppearance({ ...look, model: m.id }).ok).toBe(true);
    expect(normalizeAppearance({ ...look, model: '' }).ok).toBe(true);
    expect(normalizeAppearance({ ...look, model: 'orco-gigante' }).ok).toBe(false);
  });

  it('31 personajes cartoon: los de oficios van en el repositorio y los medievales se descargan', () => {
    expect(CARTOON_MODELS.filter((m) => m.pack === 'voc').length).toBe(17);
    expect(CARTOON_MODELS.filter((m) => m.pack === 'med').length).toBe(14);
    for (const m of CARTOON_MODELS.filter((x) => x.pack === 'voc')) expect(existsSync(pub(`models/cartoon/${m.id}.glb`)), m.id).toBe(true);
    expect(existsSync(pub('models/cartoon/paleta.png'))).toBe(true);
    expect(new Set(CARTOON_MODELS.map((m) => m.id)).size).toBe(CARTOON_MODELS.length);
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

  it('parte de los vecinos y de la policía llevan un personaje cartoon', () => {
    const all = [...app.world.zones.values()].flatMap((z) => [...z.entities]).filter((e) => e.appearance);
    const withModel = all.filter((e) => (e.appearance as any).model);
    expect(withModel.length).toBeGreaterThan(0);
    for (const e of withModel) expect(CARTOON_MODELS.some((m) => m.id === (e.appearance as any).model)).toBe(true);
  });

  it('la librería de animaciones viaja con el cliente', () => {
    expect(statSync(pub('models/anim/ual2.glb')).size).toBeGreaterThan(500_000);
  });
});
