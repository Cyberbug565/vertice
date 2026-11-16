// v0.8 · Rarezas de implantes, aceleradores Kairós, zócalo de matrices y matrices, inmunosupresor, cuna neural,
// IAs salvajes, ciberespacio y el Velo, sillas de inmersión, y las guaridas de las tres leyendas de la ciudad.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const rarityOfGrade = (g) => (g <= 1 ? 'comun' : g === 2 ? 'raro' : g === 3 ? 'epico' : 'legendario');

const KAIROS = [
  ['kairos-1', 'Kairós «Paso»', 2, 8, 6, 14000, 'Acelerador neuromotor de gama baja: solo te mueves algo más rápido. Sin zona de ralentización.'],
  ['kairos-2', 'Kairós «Callejero»', 3, 12, 9, 32000, 'Gama media: una burbuja pequeña donde todo se mueve más despacio que tú.'],
  ['kairos-3', 'Kairós de lujo «Seda»', 4, 16, 12, 62000, 'De lujo: zona de 5 m, el mundo a la mitad de velocidad.'],
  ['kairos-4', 'Kairós militar «Hoplita»', 4, 20, 15, 98000, 'Militar: zona de 7 m, las balas casi se quedan quietas.'],
  ['kairos-5', 'Kairós futurista «Quásar»', 5, 24, 18, 165000, 'Futurista: zona de 9 m, el mundo se arrastra.'],
  ['kairos-6', 'Kairós Experimental «Cometa»', 5, 26, 20, 0, 'Prototipo único de un líder de banda que llegó a lo más alto. Zona de 12 m: los demás parecen estatuas.'],
];

export function cyberwareV08(list) {
  const out = list.filter((c) => !c.id.startsWith('kairos-') && c.id !== 'zocalo-matrices').map((c) => ({ ...c, rarity: c.rarity ?? rarityOfGrade(c.grade) }));
  KAIROS.forEach(([id, name, grade, capacity, humanity, price, desc], i) => out.push({
    id, name, family: 'Acelerador neuromotor', slot: 'columna', grade, capacity, humanity, price, maker: i === 5 ? 'saqueadores' : ['engranajes', 'aurora', 'teselia', 'halcon', 'okami'][i],
    desc: `${desc} Sustituye la columna. Se activa como habilidad: gasta mucha RAM; sin RAM, quema tu salud. Al apagarlo quedas exhausto. Usarlo mucho acerca la ciberpsicosis.`,
    effects: { attrs: { REF: Math.ceil((i + 1) / 2) }, skills: {}, hpMax: i * 6, confront: 0, steal: 0, surgery: 0, carry: 0, ram: 4 + (i + 1) * 2, armor: 0, meleeDmg: 0, speed: 0.03 * (i + 1), carSpeed: 0, dodge: 0.02 * (i + 1) },
    region: 'esqueleto', rarity: i === 5 ? 'mitico' : rarityOfGrade(grade),
    ability: { kind: 'kairos', name: 'Kairós', cooldown: 4, duration: 0, power: i + 1 }, prosthetic: false, visible: 'ninguna',
  }));
  out.push({ id: 'zocalo-matrices', name: 'Zócalo de matrices', family: 'Zócalo neural', slot: 'zocalo', grade: 4, capacity: 3, humanity: 6, price: 28000, maker: 'teselia',
    desc: 'Zócalo neural con 2 ranuras para matrices (ampliable a 4 con módulos de ampliación). Las matrices consumen mucha capacidad de cromo, pero dan mejoras enormes.',
    effects: { attrs: {}, skills: {}, hpMax: 0, confront: 0, steal: 0, surgery: 0, carry: 0, ram: 0, armor: 0, meleeDmg: 0, speed: 0, carSpeed: 0, dodge: 0 }, region: 'so', rarity: 'legendario', prosthetic: false, visible: 'ninguna' });
  return out;
}

export function itemsV08(items) {
  const ids = new Set(['matriz-carmin', 'matriz-eco', 'matriz-centinela', 'matriz-berserker', 'matriz-espectro', 'ampliacion-zocalo', 'inmunosupresor', 'cuna-neural']);
  return [...items.filter((i) => !ids.has(i.id)),
    { id: 'matriz-carmin', name: 'Matriz CARMÍN', desc: 'Única. Una IA burlona vestida de rojo y verde vive aquí dentro. Se inserta en el zócalo de matrices y ya no sale.', weight: 0, category: 'matriz', rarity: 'mitico' },
    { id: 'matriz-eco', name: 'Matriz ECO', desc: 'Única. El engrama de un rockero muerto: puedes proyectarlo y controlarlo un rato.', weight: 0, category: 'matriz', rarity: 'mitico' },
    { id: 'matriz-centinela', name: 'Matriz Centinela', desc: 'Protocolo táctico militar para el zócalo de matrices.', weight: 0, category: 'matriz', rarity: 'legendario', price: 45000 },
    { id: 'matriz-berserker', name: 'Matriz Berserker', desc: 'Furia química y neuronal. Peligrosa para la cabeza.', weight: 0, category: 'matriz', rarity: 'legendario', price: 52000 },
    { id: 'matriz-espectro', name: 'Matriz Espectro', desc: 'Silencio digital: te vuelves difícil de ver.', weight: 0, category: 'matriz', rarity: 'epico', price: 26000 },
    { id: 'ampliacion-zocalo', name: 'Módulo de ampliación de zócalo', desc: 'Añade una ranura al zócalo de matrices (máximo 4). Se usa desde el inventario.', weight: 0.1, category: 'equipo', rarity: 'legendario', price: 35000 },
    { id: 'inmunosupresor', name: 'Neuroinhibidor', desc: 'Baja el nivel de ciberpsicosis, pero no acorta un episodio en curso.', weight: 0.1, category: 'medicina', rarity: 'raro', price: 450 },
    { id: 'cuna-neural', name: 'Cuna neural doméstica', desc: 'Silla de inmersión para tu casa: úsala desde el inventario dentro de tu vivienda para entrar en el ciberespacio.', weight: 12, category: 'equipo', rarity: 'legendario', price: 90000 },
  ];
}

export function factionsV08(factions) {
  const out = factions.filter((f) => f.id !== 'ias-salvajes' && f.id !== 'ias-velo');
  out.push({ id: 'ias-salvajes', name: 'IAs salvajes', kind: 'gang', desc: 'Restos de inteligencias artificiales sin dueño que vagan por el ciberespacio y atacan cualquier mente que entre.', color: '#43f3ff', archetype: 'Código hostil', territory: [], relations: {}, hostileBelow: 100, weapon: 'pistola-plasma', hp: 70, defense: 13, chrome: ['cabeza'] });
  out.push({ id: 'ias-velo', name: 'IAs del Velo', kind: 'gang', desc: 'Lo que hay al otro lado del Velo: inteligencias antiguas, enormes y hambrientas.', color: '#ff2040', archetype: 'Más allá del Velo', territory: [], relations: {}, hostileBelow: 100, weapon: 'canon-sonico', hp: 160, defense: 17, chrome: ['cabeza', 'torso'] });
  return out;
}

export function shopsV08(shops) {
  for (const s of shops) {
    if (s.id === 'farmacia') s.stock.inmunosupresor = 12;
    if (s.id === 'nodo-vacio') Object.assign(s.stock, { 'matriz-espectro': 1, 'ampliacion-zocalo': 1, 'cuna-neural': 1 });
    if (s.id === 'perista-pachinko') Object.assign(s.stock, { 'matriz-centinela': 1, 'matriz-berserker': 1 });
  }
  return shops;
}

export function ripperdocsV08(docs) {
  for (const d of docs) {
    const add = (id) => { if (!d.stock.includes(id)) d.stock.push(id); };
    if (d.maxGrade >= 3) add('kairos-1');
    if (d.maxGrade >= 3 && d.morality !== 'estricta') add('kairos-2');
    if (d.maxGrade >= 4) { add('kairos-3'); add('zocalo-matrices'); }
    if (d.id === 'vex' || d.id === 'yuki') add('kairos-4');
    if (d.id === 'carnicero') { add('kairos-4'); add('kairos-5'); }
  }
  return docs;
}

// ---------------------------------------------------------------- zonas: ciberespacio, el Velo y las guaridas
const R = (x, y, w, h) => [x, y, w, h];
function cyberspace() {
  const W = 72, H = 52;
  const blocks = [], props = [], ground = [];
  // Bordes y abismos (vacío) que dibujan caminos entre islas de datos.
  ground.push({ type: 'void', rect: R(16, 0, 3, 18) }, { type: 'void', rect: R(16, 34, 3, 18) }, { type: 'void', rect: R(34, 10, 4, 14) }, { type: 'void', rect: R(34, 30, 4, 14) }, { type: 'void', rect: R(52, 0, 3, 20) }, { type: 'void', rect: R(52, 32, 3, 20) });
  ground.push({ type: 'grid', rect: R(1, 19, 15, 14) }, { type: 'grid', rect: R(56, 22, 15, 8) });
  for (let i = 0; i < 6; i++) blocks.push({ type: 'barrier', rect: R(22 + i * 5, 4 + (i % 2) * 38, 2, 5), height: 3, color: '#0a3a5a' });
  const pr = (type, x, y, color, text) => props.push({ type, at: [x, y], color, ...(text ? { text } : {}), blocking: type !== 'glitch' && type !== 'datastream' });
  // Plaza de entrada (segura), bosque de monolitos, ruinas de código y el nido.
  for (const [x, y] of [[3, 21], [13, 21], [3, 30], [13, 30]]) pr('node', x, y, '#43f3ff');
  for (let i = 0; i < 14; i++) pr('monolith', 22 + (i * 7) % 11, 6 + Math.floor(i / 2) * 3, i % 3 ? '#43f3ff' : '#ff3fa4');
  for (let i = 0; i < 10; i++) pr('codewall', 40 + (i % 5) * 2, 6 + Math.floor(i / 5) * 9, '#5aff8a');
  for (let i = 0; i < 24; i++) pr('glitch', 4 + ((i * 13) % 64), 3 + ((i * 7) % 46), ['#ff2040', '#43f3ff', '#5aff8a'][i % 3]);
  for (let i = 0; i < 16; i++) pr('datastream', 6 + ((i * 11) % 62), 2 + ((i * 17) % 48), i % 2 ? '#43f3ff' : '#b46cff');
  return {
    id: 'ciberespacio', name: 'Ciberespacio · La Malla', kind: 'interior', cyber: true, furnished: true, width: W, height: H, chunkSize: 16, danger: 'lawless', base: 'data', ground, blocks, props,
    doors: [{ id: 'puerta-velo', name: 'El Velo', at: [70, 26], to: { zone: 'velo', at: [2, 20] }, danger: 'lawless' }],
    objects: [{ id: 'nodo-salida', name: 'Nodo de salida · desconectar', at: [3, 26], kind: 'jackout' }],
    dangerAreas: [{ level: 'protected', rect: R(1, 19, 15, 14) }],
    sectors: [],
    waypoints: [], safePoint: [8, 26], ambient: 0, police: 0,
    gangs: [{ faction: 'ias-salvajes', count: 7, area: [27, 26, 8] }, { faction: 'ias-salvajes', count: 6, area: [45, 26, 8] }, { faction: 'ias-salvajes', count: 8, area: [62, 26, 8] }],
  };
}
function velo() {
  const W = 60, H = 40, props = [], blocks = [];
  for (let i = 0; i < 40; i++) props.push({ type: 'glitch', at: [3 + ((i * 17) % 54), 2 + ((i * 11) % 36)], color: ['#ff2040', '#5aff8a', '#ffffff'][i % 3], blocking: false });
  for (let i = 0; i < 12; i++) props.push({ type: 'monolith', at: [12 + (i % 6) * 7, 6 + Math.floor(i / 6) * 27], color: '#ff2040', blocking: true });
  for (let i = 0; i < 8; i++) blocks.push({ type: 'barrier', rect: R(20 + i * 4, 14 + (i % 2) * 10, 1, 3), height: 4, color: '#3a0010' });
  return {
    id: 'velo', name: 'Más allá del Velo', kind: 'interior', cyber: true, furnished: true, width: W, height: H, chunkSize: 16, danger: 'lawless', base: 'grid', ground: [{ type: 'void', rect: R(0, 0, 1, 40) }], blocks, props,
    doors: [{ id: 'volver-malla', name: 'Volver a la Malla', at: [1, 20], to: { zone: 'ciberespacio', at: [68, 26] }, danger: 'lawless' }],
    objects: [], dangerAreas: [], sectors: [],
    waypoints: [], safePoint: [3, 20], ambient: 0, police: 0,
    gangs: [{ faction: 'ias-velo', count: 8, area: [24, 20, 8] }, { faction: 'ias-velo', count: 7, area: [38, 20, 8] }],
  };
}
function hideout(id, name, legend, back, size, deco) {
  const [W, H] = size;
  return {
    id, name, kind: 'interior', legend, furnished: true, width: W, height: H, chunkSize: 16, danger: 'public', base: deco.floor, ground: [], blocks: [], props: deco.props,
    doors: [{ id: `salida-${id}`, name: 'Salida', at: [0, Math.floor(H / 2)], to: back, danger: 'public' }],
    objects: deco.objects ?? [], dangerAreas: [], sectors: [], waypoints: [], safePoint: [2, Math.floor(H / 2)], ambient: 0, police: 0, gangs: [],
  };
}

/** Escribe zonas nuevas, añade puertas ocultas y sillas de inmersión, y crea las tres leyendas (PNJ). */
export function zonesV08(C) {
  const zfile = (id) => join(C, 'zones', `${id}.json`);
  const readZ = (id) => JSON.parse(readFileSync(zfile(id), 'utf8'));
  const writeZ = (z) => writeFileSync(zfile(z.id), JSON.stringify(z, null, 1) + '\n');
  writeZ(cyberspace());
  writeZ(velo());
  // Guaridas: detrás de una puerta sin rótulo dentro de un local de su gente.
  const legends = [
    { zone: 'guarida-iris', name: 'Cuarto de servidores sin rótulo', legend: 'iris', host: 'nodo-vacio-int', door: [0, 4], size: [12, 9],
      deco: { floor: 'metal', props: [{ type: 'screen', at: [3, 1], color: '#43f3ff' }, { type: 'screen', at: [6, 1], color: '#b46cff' }, { type: 'desk', at: [4, 2], blocking: true }, { type: 'locker', at: [10, 1], blocking: true }, { type: 'datastream', at: [9, 6], color: '#43f3ff', blocking: false }], objects: [{ id: 'silla-iris', name: 'Silla de inmersión de Iris', at: [8, 4], kind: 'neuralchair' }] } },
    { zone: 'refugio-sable', name: 'Habitación del fondo', legend: 'sable', host: 'motel-int', door: [0, 3], size: [11, 8],
      deco: { floor: 'wood', props: [{ type: 'bed', at: [8, 1], blocking: true }, { type: 'locker', at: [10, 3], blocking: true }, { type: 'table', at: [5, 5], blocking: true }, { type: 'crate', at: [9, 6], blocking: true }] } },
    { zone: 'garaje-cometa', name: 'Garaje de los Saqueadores', legend: 'teo', host: 'base-saqueadores', door: [0, 9], size: [16, 11],
      deco: { floor: 'metal', props: [{ type: 'car', at: [6, 2], color: '#ff6a20', blocking: true }, { type: 'barrel', at: [12, 2], text: 'fuego', blocking: true }, { type: 'crate', at: [13, 8], blocking: true }, { type: 'neon', at: [8, 1], color: '#ff6a20' }] } },
  ];
  for (const L of legends) {
    const host = readZ(L.host);
    const [x, y] = L.door;
    writeZ(hideout(L.zone, L.name, L.legend, { zone: L.host, at: [x + 1, y] }, L.size, L.deco));
    host.doors = host.doors.filter((d) => d.to.zone !== L.zone);
    host.doors.push({ id: `puerta-${L.zone}`, name: 'Puerta sin rótulo', at: [x, y], to: { zone: L.zone, at: [1, Math.floor(L.size[1] / 2)] }, danger: 'public' });
    // Que nada tape la puerta ni su casilla de entrada.
    host.props = (host.props ?? []).filter((p) => !(Math.abs(p.at[0] - x) <= 1 && Math.abs(p.at[1] - y) <= 1));
    host.objects = (host.objects ?? []).filter((o) => !(Math.abs(o.at[0] - x) <= 1 && Math.abs(o.at[1] - y) <= 1));
    writeZ(host);
  }
  // Sillas de inmersión: algunos fixers y las salas privadas de las grandes torres.
  for (const [zid, at, name] of [['pachinko-int', [2, 2], 'Silla de inmersión (alquiler del fixer)'], ['torre-halcon-p5', [18, 3], 'Sala de inmersión privada'], ['torre-teselia-p5', [18, 3], 'Sala de inmersión privada'], ['torre-kaiten-p3', [18, 3], 'Sala de inmersión privada']]) {
    if (!existsSync(zfile(zid))) continue;
    const z = readZ(zid);
    z.objects = (z.objects ?? []).filter((o) => o.kind !== 'neuralchair');
    z.props = (z.props ?? []).filter((p) => !(p.at[0] === at[0] && p.at[1] === at[1]));
    z.objects.push({ id: `silla-${zid}`, name, at, kind: 'neuralchair' });
    writeZ(z);
  }
}

export function npcsV08(npcs) {
  const out = npcs.filter((n) => !['leyenda-iris', 'leyenda-sable', 'leyenda-teo'].includes(n.id));
  const always = (zone, at, label) => [{ from: 0, to: 24, zone, at, state: 'rest', label }];
  out.push({ id: 'leyenda-iris', name: 'Iris «Fantasma» Kuro', title: 'Netrunner legendaria', faction: 'red-bisagra', essential: true, appearance: { skin: '#e0b48c', hair: '#d9d9e3', jacket: '#1a1a2a', accent: '#43f3ff' }, schedule: always('guarida-iris', [6, 4], 'Conectada a la red') });
  out.push({ id: 'leyenda-sable', name: 'Sable', title: 'La mejor mercenaria de Vértice', faction: 'calle', essential: true, appearance: { skin: '#8a5a3c', hair: '#1a1a1a', jacket: '#2a2a2a', accent: '#ffd23f' }, schedule: always('refugio-sable', [5, 3], 'Limpiando su arma') });
  out.push({ id: 'leyenda-teo', name: 'Teo «Cometa» Marlín', title: 'Líder de los Saqueadores', faction: 'saqueadores', essential: true, appearance: { skin: '#c89070', hair: '#5aff8a', jacket: '#3a2a1a', accent: '#ff6a20' }, schedule: always('garaje-cometa', [9, 5], 'Arreglando una moto') });
  return out;
}
