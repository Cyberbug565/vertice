// v0.37 · Formato «.voz» para escribir diálogos de calle sin pelearse con el JSON (server/voices/zonas/*.voz).
//
//   id: alta                          identificador del módulo
//   requiere: clase:alta ?noche !lugar:casino
//                                     etiquetas: «x» todas, «?x» alguna, «!x» ninguna
//   registro: Pijo, eufemismos…       nota para quien escribe (no sale en el juego)
//
//   > ¿Frase con la que abre uno?      escena: la dice un transeúnte…
//   - Respuesta posible                …y el otro contesta con una de estas
//   > {noche ?lluvia} ¿Otra escena?    {etiquetas} propias de la escena
//   = Primera | Segunda | Tercera      secuencia: se turnan los dos hablantes, en orden
//   ! {aspecto:pobre} Burla al jugador frase dirigida al jugador que pasa cerca (con sus etiquetas)
//   * Comentario suelto               reacción corta del módulo
//   # comentario                      línea ignorada
export interface Req { all: string[]; any: string[]; none: string[] }
export interface VozModule {
  id: string; requiere: Req; registro?: string;
  comentarios: string[];
  escenas: { abre: string; respuestas: string[]; requiere?: Req }[];
  secuencias: { lineas: string[]; requiere?: Req }[];
  burlas: { texto: string; requiere?: Req }[];
}
export const emptyReq = (): Req => ({ all: [], any: [], none: [] });
export function parseReq(src: string): Req {
  const r = emptyReq();
  for (const t of src.split(/[\s,]+/).filter(Boolean)) {
    if (t.startsWith('?')) r.any.push(t.slice(1));
    else if (t.startsWith('!')) r.none.push(t.slice(1));
    else r.all.push(t);
  }
  return r;
}
const MAX = 170;
export function parseVoz(text: string, file = 'voz'): VozModule {
  const m: VozModule = { id: '', requiere: emptyReq(), comentarios: [], escenas: [], secuencias: [], burlas: [] };
  let scene: VozModule['escenas'][number] | null = null;
  const fail = (n: number, msg: string) => { throw new Error(`${file}:${n + 1} · ${msg}`); };
  const split = (s: string, n: number): [Req | undefined, string] => {
    const mm = /^\{([^}]*)\}\s*(.*)$/.exec(s);
    const body = (mm ? mm[2] : s).trim();
    if (!body) fail(n, 'frase vacía');
    return [mm ? parseReq(mm[1]) : undefined, body];
  };
  const check = (s: string, n: number) => { if (s.length > MAX) fail(n, `frase de ${s.length} caracteres (máx. ${MAX})`); return s; };
  text.split(/\r?\n/).forEach((raw, n) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const head = /^(id|requiere|registro):\s*(.*)$/.exec(line);
    if (head) {
      if (head[1] === 'id') m.id = head[2].trim();
      else if (head[1] === 'requiere') m.requiere = parseReq(head[2]);
      else m.registro = head[2].trim();
      return;
    }
    const kind = line[0], rest = line.slice(1).trim();
    if (kind === '>') {
      const [req, body] = split(rest, n);
      scene = { abre: check(body, n), respuestas: [], ...(req ? { requiere: req } : {}) };
      m.escenas.push(scene);
    } else if (kind === '-') {
      if (!scene) fail(n, 'respuesta sin escena');
      scene!.respuestas.push(check(rest, n));
    } else if (kind === '=') {
      const [req, body] = split(rest, n);
      const lineas = body.split('|').map((x) => check(x.trim(), n)).filter(Boolean);
      if (lineas.length < 2) fail(n, 'una secuencia necesita al menos dos frases');
      m.secuencias.push({ lineas, ...(req ? { requiere: req } : {}) }); scene = null;
    } else if (kind === '!') {
      const [req, body] = split(rest, n);
      m.burlas.push({ texto: check(body, n), ...(req ? { requiere: req } : {}) }); scene = null;
    } else if (kind === '*') { m.comentarios.push(check(rest, n)); scene = null; }
    else fail(n, `no entiendo «${line.slice(0, 30)}»`);
  });
  if (!m.id) throw new Error(`${file} · falta «id:»`);
  for (const s of m.escenas) if (!s.respuestas.length) throw new Error(`${file} · la escena «${s.abre}» no tiene respuestas`);
  return m;
}
