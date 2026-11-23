// v0.37 · Cuenta los diálogos de zona (escenas + secuencias + burlas) y comprueba el formato. Uso: npx tsx scripts/contar-voces.ts
import { readdirSync, readFileSync } from 'node:fs';
import { parseVoz } from '../server/src/game/voz-format.js';
const dir = new URL('../server/voices/zonas/', import.meta.url);
let total = 0, lines = 0;
const seen = new Map<string, string>();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.voz')).sort()) {
  const m = parseVoz(readFileSync(new URL(f, dir), 'utf8'), f);
  const n = m.escenas.length + m.secuencias.length + m.burlas.length;
  const l = m.escenas.reduce((a, s) => a + 1 + s.respuestas.length, 0) + m.secuencias.reduce((a, s) => a + s.lineas.length, 0) + m.burlas.length + m.comentarios.length;
  for (const t of [...m.escenas.map((s) => s.abre), ...m.burlas.map((b) => b.texto), ...m.secuencias.map((s) => s.lineas[0])]) {
    const k = t.toLowerCase(); if (seen.has(k)) console.warn(`repetida en ${f} y ${seen.get(k)}: ${t}`); seen.set(k, f);
  }
  console.log(`${m.id.padEnd(12)} escenas ${String(m.escenas.length).padStart(3)} · secuencias ${String(m.secuencias.length).padStart(3)} · burlas ${String(m.burlas.length).padStart(3)} = ${n} diálogos, ${l} frases`);
  total += n; lines += l;
}
console.log(`TOTAL ${total} diálogos, ${lines} frases`);
