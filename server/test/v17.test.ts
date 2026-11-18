// v0.17 · Peinados de la colección (modelos de la release) válidos al crear; prendas del samurái a la venta.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HAIR_COLLECTION, normalizeAppearance } from '@vertice/shared';
import { createApp } from '../src/app.js';

let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => { app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: process.env.TEST_DATABASE_URL, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false }); });
afterAll(async () => { await app?.close(); });

const look = { skin: '#c89070', hair: '#222222', jacket: '#40506a', accent: '#43f3ff' };
describe('v0.17', () => {
  it('los 106 peinados de la colección se aceptan y los inventados no', () => {
    expect(HAIR_COLLECTION.length).toBe(106);
    for (const h of ['pelo-001', 'pelo-105', 'pelo-real-001']) expect(normalizeAppearance({ ...look, hairStyle: h }).ok).toBe(true);
    expect(normalizeAppearance({ ...look, hairStyle: 'pelo-999' }).ok).toBe(false);
  });
  it('el kabuto oni y las grebas flotantes existen, se visten en su hueco y se venden', () => {
    const c = (app.world as any).c;
    const kab = c.items.find((i: any) => i.id === 'kabuto-oni'), gre = c.items.find((i: any) => i.id === 'grebas-flotantes');
    expect(kab.wear.slot).toBe('cabeza'); expect(kab.wear.style).toBe('casco-oni');
    expect(gre.wear.slot).toBe('pies'); expect(gre.wear.style).toBe('grebas-flotantes');
    expect(c.shops.some((s: any) => s.stock['kabuto-oni'] > 0)).toBe(true);
    expect(c.shops.some((s: any) => s.stock['grebas-flotantes'] > 0)).toBe(true);
  });
});
