// Capas de contenido: cambios hechos a mano sobre ficheros que el generador vuelve a crear.
// `diffJson(a, b)` guarda la diferencia estructural entre lo generado (a) y lo editado (b);
// `applyJson(a, d)` la vuelve a aplicar tras regenerar. Las listas de objetos con `id` se combinan por id;
// el resto de listas de objetos, como multiconjunto (añadidos y quitados); lo demás se sustituye.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function diffJson(a, b) {
  if (eq(a, b)) return undefined;
  if (isObj(a) && isObj(b)) {
    const out = {};
    for (const k of Object.keys(b)) { const d = k in a ? diffJson(a[k], b[k]) : { $set: b[k] }; if (d !== undefined) out[k] = d; }
    for (const k of Object.keys(a)) if (!(k in b)) out[k] = { $del: true };
    return { $obj: out };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyed = [...a, ...b].length > 0 && [...a, ...b].every((x) => isObj(x) && typeof x.id === 'string');
    if (keyed) {
      const am = new Map(a.map((x) => [x.id, x])), bm = new Map(b.map((x) => [x.id, x]));
      const out = {};
      for (const [id, v] of bm) { const d = am.has(id) ? diffJson(am.get(id), v) : { $set: v }; if (d !== undefined) out[id] = d; }
      for (const id of am.keys()) if (!bm.has(id)) out[id] = { $del: true };
      return { $keyed: out };
    }
    if ([...a, ...b].every((x) => isObj(x) || Array.isArray(x))) {
      const rest = a.map((x) => JSON.stringify(x));
      const add = [];
      for (const x of b) { const i = rest.indexOf(JSON.stringify(x)); if (i >= 0) rest.splice(i, 1); else add.push(x); }
      return { $multi: { add, remove: rest.map((s) => JSON.parse(s)) } };
    }
  }
  return { $set: b };
}

export function applyJson(a, d) {
  if (d === undefined) return a;
  if ('$set' in d) return structuredClone(d.$set);
  if ('$obj' in d) {
    const out = isObj(a) ? { ...a } : {};
    for (const [k, v] of Object.entries(d.$obj)) { if (v.$del) delete out[k]; else out[k] = applyJson(out[k], v); }
    return out;
  }
  if ('$keyed' in d) {
    const out = Array.isArray(a) ? [...a] : [];
    for (const [id, v] of Object.entries(d.$keyed)) {
      const i = out.findIndex((x) => x?.id === id);
      if (v.$del) { if (i >= 0) out.splice(i, 1); }
      else if (i >= 0) out[i] = applyJson(out[i], v);
      else out.push(applyJson(undefined, v));
    }
    return out;
  }
  if ('$multi' in d) {
    const out = Array.isArray(a) ? [...a] : [];
    for (const r of d.$multi.remove) { const i = out.findIndex((x) => eq(x, r)); if (i >= 0) out.splice(i, 1); }
    return [...out, ...structuredClone(d.$multi.add)];
  }
  return a;
}

/** Aplica todas las capas de scripts/overlays/*.json (en orden alfabético) sobre content/. */
export function applyOverlays(contentDir, overlaysDir) {
  if (!existsSync(overlaysDir)) return 0;
  let n = 0;
  for (const f of readdirSync(overlaysDir).filter((x) => x.endsWith('.json')).sort()) {
    const layer = JSON.parse(readFileSync(join(overlaysDir, f), 'utf8'));
    for (const [rel, d] of Object.entries(layer)) {
      const p = join(contentDir, rel);
      const cur = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined;
      writeFileSync(p, JSON.stringify(applyJson(cur, d), null, 1) + '\n');
      n++;
    }
  }
  return n;
}
