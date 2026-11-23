// v0.37 · Diálogos por zona: 1000+ diálogos nuevos, secuencia de contextualización y elección por especificidad.
import { describe, it, expect } from 'vitest';
import { seededRng } from '@vertice/shared';
import { readdirSync, readFileSync } from 'node:fs';
import { streetModules, Voices } from '../src/game/voices.js';
import { parseVoz } from '../src/game/voz-format.js';
import { DISTRICT_CLASS } from '../src/world/context.js';
import { createApp } from '../src/app.js';

const zonas = streetModules.filter((m) => m.secuencias.length || m.burlas.length);
const ids = (tags: string[]) => new Set(tags);
const where = (line: string | undefined) => line && streetModules.find((m) => m.escenas.some((s) => s.abre === line || s.respuestas.includes(line)) || m.secuencias.some((q) => q.lineas.includes(line)) || m.burlas.some((b) => b.texto === line))?.id;

describe('v0.37 · diálogos por zona', () => {
  it('hay al menos 1000 diálogos nuevos (escenas + secuencias + burlas), sin aperturas repetidas y con frases cortas', () => {
    const dir = new URL('../voices/zonas/', import.meta.url);
    const mods = readdirSync(dir).filter((f) => f.endsWith('.voz')).map((f) => parseVoz(readFileSync(new URL(f, dir), 'utf8'), f));
    const total = mods.reduce((a, m) => a + m.escenas.length + m.secuencias.length + m.burlas.length, 0);
    expect(total).toBeGreaterThanOrEqual(1000);
    const openers = mods.flatMap((m) => [...m.escenas.map((s) => s.abre), ...m.burlas.map((b) => b.texto), ...m.secuencias.map((s) => s.lineas[0])]);
    expect(new Set(openers.map((s) => s.toLowerCase())).size).toBe(openers.length);
    for (const m of mods) for (const s of m.escenas) expect(s.respuestas.length, s.abre).toBeGreaterThanOrEqual(2);
    // Cada clase de barrio tiene su módulo y todos los barrios de la ciudad tienen clase.
    for (const cls of ['alta', 'corpo', 'ocio', 'obrera', 'marginal', 'yermo']) expect(mods.some((m) => m.requiere.all.includes('clase:' + cls)), cls).toBe(true);
    const city = JSON.parse(readFileSync(new URL('../../content/zones/vertice.json', import.meta.url), 'utf8'));
    for (const d of city.districts) expect(DISTRICT_CLASS[d.id], d.id).toBeTruthy();
    expect(zonas.length).toBeGreaterThanOrEqual(14);
  });

  it('cada barrio habla con su registro y gana la frase más específica', () => {
    const v = new Voices(() => 0.1);
    for (const cls of ['alta', 'corpo', 'ocio', 'obrera', 'marginal', 'yermo']) {
      const tags = ids(['clase:' + cls, 'exterior', 'dia', 'peligro:public', 'caracter:cauto']);
      for (let i = 0; i < 6; i++) expect(where(v.conversation({ cls, i }, tags)?.[0]), cls).toBe(cls);
    }
    // Interior: el casino habla de casino aunque esté en un barrio rico.
    expect(where(v.conversation({}, ids(['clase:alta', 'lugar:casino', 'interior', 'noche']))?.[0])).toBe('casino');
    // Burla según la pinta del jugador y el barrio: un pijo en el Arrabal, un andrajoso en Colinas.
    const rich = v.taunt({}, ids(['clase:marginal', 'jugador:cerca', 'aspecto:caro', 'saludo', 'dia']));
    expect(where(rich)).toBe('marginal');
    expect(streetModules.find((m) => m.id === 'marginal')!.burlas.find((b) => b.texto === rich)!.requiere?.all).toContain('aspecto:caro');
    const poor = v.taunt({}, ids(['clase:alta', 'jugador:cerca', 'aspecto:pobre', 'saludo', 'dia']));
    expect(where(poor)).toBe('alta');
    // Sin burla de barrio, la genérica de aspecto.
    expect(where(v.taunt({}, ids(['jugador:cerca', 'jugador:muy-cromado'])))).toBe('aspecto');
  });

  it('las secuencias se turnan entre hablantes y la memoria no repite lo mismo seguido', () => {
    const v = new Voices(seededRng(37));
    const who = {};
    const seen = new Set<string>();
    let seq = 0;
    for (let i = 0; i < 40; i++) {
      const c = v.conversation(who, ids(['clase:obrera', 'exterior', 'noche']))!;
      expect(c.length).toBeGreaterThanOrEqual(2);
      if (c.length > 2) seq++;
      seen.add(c[0]);
    }
    expect(seq).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThanOrEqual(20); // 40 charlas seguidas del mismo hablante: casi todas distintas
  });

  it('la secuencia de contextualización etiqueta clase, lugar, peligro, hora y la pinta del jugador', async () => {
    const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 0, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false });
    try {
      const w = app.world;
      const city = w.zones.get('vertice')!;
      const d = city.def.districts.find((x) => x.id === 'arrabal')!;
      const npc = w.addEntity(city, { kind: 'npc', name: 'Testigo', x: d.safePoint[0] + 0.5, y: d.safePoint[1] + 0.5, interactive: true, label: '' });
      const tags = w.street.context(npc);
      for (const t of ['clase:marginal', 'barrio:arrabal', 'exterior']) expect(tags.has(t), t).toBe(true);
      expect([...tags].some((t) => t.startsWith('peligro:'))).toBe(true);
      expect(tags.has('dia') || tags.has('noche')).toBe(true);
      const casino = w.zones.get('casino-meridiano')!;
      const guard = w.addEntity(casino, { kind: 'npc', name: 'Crupier', x: casino.def.safePoint[0] + 0.5, y: casino.def.safePoint[1] + 0.5, interactive: true, label: '' });
      const t2 = w.street.context(guard);
      expect(t2.has('lugar:casino')).toBe(true);
      expect(t2.has('interior')).toBe(true);
    } finally { await app.close(); }
  });
});
