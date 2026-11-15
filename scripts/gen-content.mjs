// Generador determinista de contenido derivado: interiores, puestos de trabajo, 100 empleos, PNJ y diálogos de matasanos.
// Uso: node scripts/gen-content.mjs   (sobrescribe los ficheros generados en content/; el resto es contenido escrito a mano)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const C = join(dirname(fileURLToPath(import.meta.url)), '../content');
const write = (f, d) => writeFileSync(join(C, f), JSON.stringify(d, null, 1) + '\n');
const read = (f) => JSON.parse(readFileSync(join(C, f), 'utf8'));

// ---------------------------------------------------------------- interiores
// small: 12×9 con salida en (11,4) → llegada (9,4). big: 16×11 con salida en (15,5) → llegada (13,5). pachinko: 14×10, salida (13,5).
const SIZE = { small: [12, 9, [11, 4]], big: [16, 11, [15, 5]], mid: [14, 10, [13, 5]] };
const interiors = [
  { id: 'tienda-24h-int', name: 'Aurora 24H', size: 'small', base: 'tile', wall: '#405a5a', out: ['ferro', 46, 44], danger: 'protected',
    shelves: [[2, 1], [3, 1], [4, 1], [5, 1], [2, 6], [3, 6], [4, 6]], objects: [{ id: 'caja-24h', name: 'Caja de Aurora 24H', at: [7, 3], kind: 'shop', shop: 'aurora-24h' }],
    work: [['wp-tienda-24h', 'Reponedor de Aurora 24H', [8, 1]]] },
  { id: 'ramen-int', name: 'Ramen Kanal', size: 'small', base: 'wood', wall: '#3d5250', out: ['ferro', 80, 33], danger: 'protected',
    counters: [[2, 2, 5, 1]], tables: [[3, 6], [6, 6]], objects: [{ id: 'barra-ramen', name: 'Barra de Ramen Kanal', at: [7, 2], kind: 'shop', shop: 'ramen-kanal' }],
    work: [['wp-cocina-ramen', 'Cocina de Ramen Kanal', [9, 1]], ['wp-sala-ramen', 'Sala de Ramen Kanal', [9, 7]]] },
  { id: 'voltio-int', name: 'Club Voltio', size: 'big', base: 'metal', wall: '#3a2f55', out: ['ferro', 67, 20], danger: 'public',
    counters: [[2, 3, 1, 5]], tables: [[7, 7], [10, 7], [7, 3]], neon: [[6, 1, '#b46cff'], [11, 1, '#43f3ff']], objects: [{ id: 'barra-voltio', name: 'Barra del Voltio', at: [3, 8], kind: 'shop', shop: 'voltio-barra' }],
    work: [['wp-escenario-voltio', 'Escenario del Voltio', [12, 2]], ['wp-barra-voltio', 'Barra del Voltio', [3, 2]], ['wp-puerta-voltio', 'Puerta del Voltio', [14, 9]]] },
  { id: 'pachinko-int', name: 'Pachinko Estrella', size: 'mid', base: 'tile', wall: '#39465a', out: ['ferro', 88, 55], danger: 'public',
    screens: [[2, 1, '#43f3ff'], [4, 1, '#ff4fa0'], [6, 1, '#ffd23f'], [8, 1, '#7dff7a']], objects: [{ id: 'trastienda-perista', name: 'Trastienda del perista', at: [2, 7], kind: 'shop', shop: 'perista-pachinko' }],
    work: [['wp-sala-pachinko', 'Sala de juego del Pachinko', [10, 1]], ['wp-trastienda', 'Trastienda del Pachinko', [4, 8]]] },
  { id: 'carnicero-int', name: 'El Carnicero', size: 'small', base: 'metal', wall: '#5a2a2a', out: ['ferro', 95, 53], danger: 'public', beds: [[3, 5, '#ff5a5a']], screens: [[5, 1, '#ff5a5a']] },
  { id: 'iruka-int', name: 'Clínica de Mama Iruka', size: 'small', base: 'tile', wall: '#2f5d62', out: ['ferro', 80, 44], danger: 'protected', beds: [[3, 5, '#5affc8']], screens: [[5, 1, '#5affc8']], plants: [[10, 7]],
    work: [['wp-iruka', 'Consulta de Mama Iruka', [7, 1]]] },
  { id: 'ruiz-int', name: 'Prótesis Ruiz', size: 'small', base: 'metal', wall: '#574a3a', out: ['ferro', 26, 55], danger: 'protected', beds: [[3, 5, '#ff8a3d']], shelves: [[7, 1], [8, 1]],
    work: [['wp-ruiz', 'Banco de prótesis de Ruiz', [5, 1]]] },
  { id: 'koi-int', name: 'Hotel Koi · Cápsulas', size: 'big', base: 'wood', wall: '#4a3a5c', out: ['ferro', 41, 20], danger: 'protected', capsules: { quality: 0.9, price: 25, at: [[2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [12, 1]] },
    work: [['wp-recepcion-koi', 'Recepción del Hotel Koi', [13, 8]]] },
  { id: 'almacen-int', name: 'Almacén del muelle', size: 'big', base: 'metal', wall: '#3a3f5c', out: ['ferro', 10, 14], danger: 'public', crates: [[2, 2], [3, 2], [2, 3], [6, 2], [7, 2], [6, 7], [7, 7], [10, 3]],
    work: [['wp-almacen-carga', 'Zona de carga del almacén', [4, 8]], ['wp-almacen-chatarra', 'Desguace del almacén', [11, 8]]] },
  { id: 'nido-int', name: 'Hotel Cápsula Nido', size: 'big', base: 'tile', wall: '#3e3550', out: ['cenit', 18, 21], danger: 'protected', capsules: { quality: 0.95, price: 40, at: [[2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [2, 9], [4, 9]] },
    work: [['wp-recepcion-nido', 'Recepción del Nido', [13, 8]]] },
  { id: 'okami-super-int', name: 'Supermercado Okami', size: 'small', base: 'tile', wall: '#3a2e44', out: ['cenit', 28, 28], danger: 'protected',
    shelves: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [2, 5], [3, 5], [4, 5]], objects: [{ id: 'caja-okami', name: 'Caja de Okami Market', at: [8, 6], kind: 'shop', shop: 'okami-super' }],
    work: [['wp-okami-super', 'Reposición de Okami Market', [8, 1]]] },
  { id: 'clinica-okami-int', name: 'Clínica Okami', size: 'small', base: 'tile', wall: '#26404a', out: ['cenit', 39, 28], danger: 'protected', beds: [[3, 5, '#5affc8'], [6, 5, '#5affc8']], screens: [[4, 1, '#5affc8'], [7, 1, '#5affc8']],
    work: [['wp-clinica-okami', 'Quirófano de la Clínica Okami', [9, 1]]] },
  { id: 'armeria-int', name: 'Armería Halcón', size: 'small', base: 'metal', wall: '#2e3a44', out: ['cenit', 56, 28], danger: 'protected', shelves: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]],
    objects: [{ id: 'mostrador-armeria', name: 'Mostrador de la Armería Halcón', at: [7, 4], kind: 'shop', shop: 'armeria-halcon' }], work: [['wp-armeria', 'Almacén de la Armería', [8, 1]]] },
  { id: 'oficinas-halcon-int', name: 'Oficinas Halcón', size: 'big', base: 'tile', wall: '#2c3444', out: ['cenit', 66, 28], danger: 'protected', tables: [[3, 4], [6, 4], [9, 4], [3, 7], [6, 7], [9, 7]], screens: [[4, 1, '#43f3ff'], [8, 1, '#43f3ff']],
    work: [['wp-halcon-oficina', 'Despachos de Halcón', [11, 2]], ['wp-halcon-seguridad', 'Control de seguridad de Halcón', [13, 8]], ['wp-halcon-red', 'Sala de red de Halcón', [2, 2]]] },
  { id: 'teselia-int', name: 'Torre de Datos Teselia', size: 'big', base: 'tile', wall: '#262c48', out: ['cenit', 34, 49], danger: 'protected', tables: [[3, 4], [6, 4], [9, 4], [3, 7], [6, 7]], screens: [[3, 1, '#b46cff'], [6, 1, '#b46cff'], [9, 1, '#b46cff']],
    work: [['wp-teselia-red', 'Granja de servidores Teselia', [12, 2]], ['wp-teselia-lab', 'Laboratorio neural Teselia', [12, 8]], ['wp-teselia-oficina', 'Oficinas Teselia', [2, 2]]] },
  { id: 'comisaria-int', name: 'Comisaría PCV Cénit', size: 'big', base: 'tile', wall: '#2c3a52', out: ['cenit', 60, 49], danger: 'protected', tables: [[4, 4], [7, 4], [4, 7], [7, 7]], screens: [[5, 1, '#60a5fa']],
    objects: [{ id: 'recompensas-comisaria', name: 'Tablón de recompensas de la comisaría', at: [10, 1], kind: 'bountyboard' }],
    work: [['wp-comisaria', 'Mostrador de denuncias', [12, 8]], ['wp-comisaria-calabozos', 'Calabozos', [2, 9]]] },
  { id: 'laboratorio-int', name: 'Laboratorios Okami', size: 'big', base: 'tile', wall: '#2e3a46', out: ['cenit', 11, 63], danger: 'protected', tables: [[3, 4], [6, 4], [9, 4]], beds: [[3, 8, '#5affc8']], screens: [[5, 1, '#5affc8'], [9, 1, '#5affc8']],
    work: [['wp-lab-okami', 'Bancada de Laboratorios Okami', [12, 2]], ['wp-lab-ensayos', 'Sala de ensayos clínicos', [12, 8]]] },
  { id: 'vex-int', name: 'Consulta del Dr. Vex', size: 'small', base: 'metal', wall: '#3a3040', out: ['cenit', 32, 58], danger: 'public', beds: [[3, 5, '#ff5a5a']], screens: [[5, 1, '#b46cff']] },
  { id: 'logistica-int', name: 'Centro Logístico Aurora', size: 'big', base: 'metal', wall: '#3a4038', out: ['cenit', 61, 63], danger: 'public', crates: [[2, 2], [3, 2], [4, 2], [2, 7], [3, 7], [9, 2], [10, 2], [9, 7]],
    work: [['wp-logistica-muelle', 'Muelle de carga Aurora', [6, 9]], ['wp-logistica-reparto', 'Mostrador de reparto Aurora', [12, 2]]] },
];

const zones = [];
const workplaces = [
  { id: 'wp-muelles-ferro', name: 'Muelles de Ferro', zone: 'ferro', at: [30, 6] },
  { id: 'wp-mercado-lumen', name: 'Mercado Lumen', zone: 'ferro', at: [22, 35] },
  { id: 'wp-desguace', name: 'Desguace de Tomás', zone: 'ferro', at: [40, 55] },
  { id: 'wp-generador', name: 'Generador del mercado', zone: 'ferro', at: [26, 26] },
  { id: 'wp-esquina-kanal', name: 'Esquina de Kanal', zone: 'ferro', at: [73, 40] },
  { id: 'wp-bar-rele', name: 'Barra de El Relé', zone: 'bar-rele', at: [5, 3] },
  { id: 'wp-clinica-sato', name: 'Consulta de Doc Sato', zone: 'clinica-sato', at: [6, 5] },
  { id: 'wp-plaza-cenit', name: 'Plaza Teselia', zone: 'cenit', at: [84, 22] },
  { id: 'wp-avenida-cenit', name: 'Avenida central de Cénit', zone: 'cenit', at: [40, 32] },
];
for (const it of interiors) {
  const [w, h, exit] = SIZE[it.size];
  const blocks = [], props = [], objects = [...(it.objects ?? [])];
  for (const [x, y, ww, hh] of it.counters ?? []) blocks.push({ type: 'counter', rect: [x, y, ww, hh], color: it.wall });
  for (const [x, y] of it.shelves ?? []) props.push({ type: 'shelf', at: [x, y] });
  for (const [x, y] of it.tables ?? []) props.push({ type: 'table', at: [x, y] });
  for (const [x, y] of it.crates ?? []) props.push({ type: 'crate', at: [x, y] });
  for (const [x, y] of it.plants ?? []) props.push({ type: 'plant', at: [x, y] });
  for (const [x, y, c] of it.beds ?? []) props.push({ type: 'bed', at: [x, y], color: c });
  for (const [x, y, c] of it.screens ?? []) props.push({ type: 'screen', at: [x, y], blocking: false, color: c });
  for (const [x, y, c] of it.neon ?? []) props.push({ type: 'neon', at: [x, y], blocking: false, color: c });
  if (it.capsules) it.capsules.at.forEach(([x, y], i) => objects.push({ id: `${it.id}-capsula-${i + 1}`, name: `Cápsula ${i + 1} (${it.capsules.price} €$/noche)`, at: [x, y], kind: 'bed', sleep: { quality: it.capsules.quality, price: it.capsules.price } }));
  for (const [id, name, [x, y]] of it.work ?? []) {
    objects.push({ id: `obj-${id}`, name: `Puesto: ${name}`, at: [x, y], kind: 'workplace', workplace: id });
    const stand = y <= 1 ? [x, y + 1] : y >= h - 2 ? [x, y - 1] : [x - 1, y];
    workplaces.push({ id, name, zone: it.id, at: stand });
  }
  zones.push({
    id: it.id, name: it.name, kind: 'interior', width: w, height: h, danger: it.danger, base: it.base, wallColor: it.wall, blocks, props,
    doors: [{ id: `salida-${it.id}`, name: `Salida a la calle (${it.out[0] === 'ferro' ? 'Ferro' : 'Cénit'})`, at: exit, to: { zone: it.out[0], at: [it.out[1], it.out[2]] }, danger: 'public' }],
    objects, waypoints: [[exit[0] - 2, exit[1]]], safePoint: [exit[0] - 2, exit[1]],
  });
}
for (const z of zones) write(`zones/${z.id}.json`, z);
write('workplaces.json', workplaces);

// ---------------------------------------------------------------- 100 empleos (20 oficios × 5)
// [título, descripción, puesto, segundos, paga, dificultad, rango mínimo, riesgo, enfriamiento (h de juego)]
const J = {
  medico: ['okami', [
    ['Guardia de urgencias', 'Atiende a los heridos que llegan a la consulta de Doc Sato.', 'wp-clinica-sato', 30, 90, 13, 0, 0, 3],
    ['Ayudante de quirófano', 'Asiste en una implantación de cromo en la Clínica Okami.', 'wp-clinica-okami', 45, 180, 15, 1, 0, 4],
    ['Médica de barrio', 'Pasa consulta gratuita en el Mercado Lumen y cobra de la asociación.', 'wp-mercado-lumen', 35, 80, 12, 0, 0, 3],
    ['Ensayo clínico supervisado', 'Supervisa voluntarios en un ensayo de Laboratorios Okami.', 'wp-lab-ensayos', 50, 220, 16, 2, 0, 6],
    ['Curas en la clínica de Iruka', 'Limpia y cose a los clientes de Mama Iruka sin hacer preguntas.', 'wp-iruka', 30, 110, 13, 0, 0.05, 3]], 'okami'],
  corpo: ['okami', [
    ['Analista junior de Halcón', 'Revisa informes de incidentes de seguridad en las oficinas de Halcón.', 'wp-halcon-oficina', 40, 150, 13, 0, 0, 4],
    ['Gestor de cuentas Teselia', 'Negocia renovaciones de licencias neurales con clientes medianos.', 'wp-teselia-oficina', 45, 200, 15, 1, 0, 5],
    ['Auditor de inventario Okami', 'Cuadra existencias del supermercado con la central.', 'wp-okami-super', 35, 120, 12, 0, 0, 4],
    ['Enlace corporativo en la plaza', 'Representa a Okami ante la prensa en la Plaza Teselia.', 'wp-plaza-cenit', 30, 140, 14, 1, 0, 5],
    ['Reunión de presupuesto', 'Defiende el presupuesto de tu departamento ante dirección.', 'wp-halcon-oficina', 55, 320, 17, 3, 0, 8]], 'okami'],
  merc: ['red-bisagra', [
    ['Escolta de mercancía', 'Acompaña una entrega desde los muelles hasta el desguace.', 'wp-muelles-ferro', 40, 160, 14, 0, 0.1, 4],
    ['Vigilancia nocturna para Nadia', 'Guarda el reservado de Nadia mientras cierra tratos.', 'wp-bar-rele', 45, 140, 13, 0, 0.05, 4],
    ['Cobro de deudas', 'Recuerda a un deudor de Kanal que debe dinero a la red de Nadia.', 'wp-esquina-kanal', 30, 200, 15, 1, 0.15, 6],
    ['Seguridad de un trato en el Pachinko', 'Vigila la sala mientras dos bandas negocian.', 'wp-sala-pachinko', 50, 260, 16, 2, 0.2, 6],
    ['Despejar el desguace', 'Echa a unos saqueadores del desguace de Tomás.', 'wp-desguace', 35, 220, 16, 1, 0.25, 6]], 'red-bisagra'],
  tecnico: ['asociacion-lumen', [
    ['Mantenimiento del generador', 'Revisa el generador del Mercado Lumen.', 'wp-generador', 30, 90, 12, 0, 0, 3],
    ['Reparar grúas del muelle', 'Cambia los cables de las grúas del almacén.', 'wp-almacen-carga', 40, 130, 14, 0, 0.05, 4],
    ['Calibrar prótesis', 'Ayuda a Ruiz a calibrar prótesis de segunda mano.', 'wp-ruiz', 35, 120, 13, 0, 0, 4],
    ['Técnico de servidores', 'Sustituye módulos en la granja de servidores Teselia.', 'wp-teselia-red', 45, 210, 15, 2, 0, 5],
    ['Reparación de flota Aurora', 'Repara drones de reparto en el centro logístico.', 'wp-logistica-muelle', 40, 170, 14, 1, 0, 4]], 'aurora'],
  guardia: ['halcon', [
    ['Portero del Voltio', 'Decide quién entra en el Club Voltio esta noche.', 'wp-puerta-voltio', 40, 110, 13, 0, 0.1, 4],
    ['Control de acceso Halcón', 'Comprueba credenciales en el control de las oficinas de Halcón.', 'wp-halcon-seguridad', 45, 150, 13, 0, 0, 4],
    ['Vigilante de Aurora 24H', 'Vigila la tienda 24 horas durante el turno de noche.', 'wp-tienda-24h', 35, 90, 12, 0, 0.1, 3],
    ['Seguridad de la armería', 'Custodia el almacén de la Armería Halcón.', 'wp-armeria', 40, 170, 14, 1, 0, 5],
    ['Patrulla de la plaza', 'Patrulla la Plaza Teselia en nombre de Halcón.', 'wp-plaza-cenit', 50, 190, 15, 2, 0.05, 5]], 'halcon'],
  policia: ['pcv', [
    ['Atender denuncias', 'Recoge denuncias en el mostrador de la comisaría.', 'wp-comisaria', 35, 100, 12, 0, 0, 3],
    ['Custodia de calabozos', 'Vigila los calabozos de la comisaría de Cénit.', 'wp-comisaria-calabozos', 45, 140, 13, 0, 0.05, 4],
    ['Patrulla en Kanal', 'Patrulla una esquina caliente de Kanal.', 'wp-esquina-kanal', 40, 170, 15, 1, 0.2, 5],
    ['Control en la avenida', 'Monta un control de identificación en la avenida central.', 'wp-avenida-cenit', 40, 150, 14, 1, 0.05, 4],
    ['Inspección del desguace', 'Comprueba la procedencia de las piezas de Tomás.', 'wp-desguace', 35, 160, 15, 2, 0.1, 5]], 'pcv'],
  transportista: ['aurora', [
    ['Ruta de reparto Aurora', 'Carga y reparte paquetes desde el centro logístico.', 'wp-logistica-reparto', 40, 120, 12, 0, 0.05, 3],
    ['Carga en los muelles', 'Mueve contenedores en los muelles de Ferro.', 'wp-muelles-ferro', 40, 110, 12, 0, 0.05, 3],
    ['Suministro del Mercado Lumen', 'Lleva género a los puestos del mercado.', 'wp-mercado-lumen', 35, 100, 12, 0, 0, 3],
    ['Transporte de muestras Okami', 'Lleva muestras refrigeradas a Laboratorios Okami.', 'wp-lab-okami', 35, 170, 14, 1, 0, 4],
    ['Convoy de mercancía declarada', 'Coordina un convoy de Aurora con papeles en regla.', 'wp-logistica-muelle', 55, 260, 16, 2, 0.1, 6]], 'aurora'],
  cocinero: ['asociacion-lumen', [
    ['Turno en Ramen Kanal', 'Cocina caldos durante la hora punta.', 'wp-cocina-ramen', 40, 90, 12, 0, 0, 3],
    ['Puesto del Mercado Lumen', 'Cubre el puesto de Lin mientras descansa.', 'wp-mercado-lumen', 35, 80, 11, 0, 0, 3],
    ['Cocina del Voltio', 'Prepara aperitivos para la clientela del club.', 'wp-barra-voltio', 40, 110, 13, 0, 0, 4],
    ['Menú de laboratorio', 'Cocina para el personal de Laboratorios Okami.', 'wp-lab-okami', 40, 150, 14, 1, 0, 4],
    ['Banquete ejecutivo', 'Sirve un banquete para directivos de Halcón.', 'wp-halcon-oficina', 55, 280, 16, 2, 0, 8]], 'okami'],
  camarero: ['red-bisagra', [
    ['Barra de El Relé', 'Sirve copas en el bar de Nadia.', 'wp-bar-rele', 35, 80, 11, 0, 0, 3],
    ['Barra del Voltio', 'Sirve a la clientela del club más ruidoso de Kanal.', 'wp-barra-voltio', 40, 100, 12, 0, 0.05, 3],
    ['Sala de Ramen Kanal', 'Atiende mesas en Ramen Kanal.', 'wp-sala-ramen', 35, 80, 11, 0, 0, 3],
    ['Recepción del Hotel Koi', 'Atiende a los huéspedes de las cápsulas.', 'wp-recepcion-koi', 40, 90, 12, 0, 0, 3],
    ['Recepción del Nido', 'Atiende la recepción del hotel cápsula de Cénit.', 'wp-recepcion-nido', 40, 130, 13, 1, 0, 4]], 'asociacion-lumen'],
  periodista: ['calle', [
    ['Crónica del mercado', 'Entrevista a comerciantes del Mercado Lumen.', 'wp-mercado-lumen', 35, 90, 12, 0, 0, 3],
    ['Rueda de prensa corporativa', 'Cubre un anuncio de Okami en la Plaza Teselia.', 'wp-plaza-cenit', 40, 140, 14, 0, 0, 4],
    ['Sucesos en la comisaría', 'Consigue declaraciones en la comisaría.', 'wp-comisaria', 35, 130, 14, 1, 0, 4],
    ['Reportaje en Kanal', 'Documenta la vida nocturna de Kanal.', 'wp-esquina-kanal', 45, 170, 15, 1, 0.15, 5],
    ['Investigación en los muelles', 'Sigue el rastro de un cargamento sin declarar.', 'wp-muelles-ferro', 50, 240, 16, 2, 0.15, 6]], 'calle'],
  netcorp: ['teselia', [
    ['Mantenimiento de ICE', 'Revisa las defensas de red de Halcón.', 'wp-halcon-red', 40, 180, 14, 0, 0, 4],
    ['Auditoría de accesos', 'Revisa registros de acceso en la granja de Teselia.', 'wp-teselia-red', 40, 190, 14, 0, 0, 4],
    ['Prueba de intrusión autorizada', 'Ataca la red de Teselia con permiso firmado.', 'wp-teselia-lab', 50, 280, 16, 1, 0.05, 6],
    ['Rastreo de filtraciones', 'Busca quién filtra datos de Okami.', 'wp-lab-okami', 45, 240, 15, 1, 0, 5],
    ['Guardia de red nocturna', 'Vigila la red de Halcón durante la noche.', 'wp-halcon-red', 55, 300, 17, 2, 0.05, 8]], 'teselia'],
  estibador: ['chatarreros', [
    ['Descarga de contenedores', 'Descarga un buque en los muelles de Ferro.', 'wp-muelles-ferro', 40, 90, 11, 0, 0.05, 3],
    ['Organizar el almacén', 'Ordena palés en el almacén del muelle.', 'wp-almacen-carga', 35, 80, 11, 0, 0.05, 3],
    ['Carga para Aurora', 'Carga camiones en el centro logístico.', 'wp-logistica-muelle', 40, 100, 12, 0, 0.05, 3],
    ['Turno doble en el muelle', 'Encadena dos turnos de descarga.', 'wp-muelles-ferro', 60, 190, 14, 1, 0.1, 6],
    ['Capataz de muelle', 'Dirige a la cuadrilla de estibadores.', 'wp-almacen-carga', 50, 220, 15, 2, 0.05, 6]], 'aurora'],
  dependiente: ['aurora', [
    ['Cajero de Aurora 24H', 'Atiende la caja de la tienda 24 horas.', 'wp-tienda-24h', 35, 70, 11, 0, 0.05, 3],
    ['Reponedor de Okami Market', 'Repone estanterías del supermercado Okami.', 'wp-okami-super', 35, 80, 11, 0, 0, 3],
    ['Atención en la armería', 'Atiende a clientes con licencia en la Armería Halcón.', 'wp-armeria', 40, 130, 13, 1, 0, 4],
    ['Venta de cápsulas', 'Vende noches de cápsula en el Hotel Koi.', 'wp-recepcion-koi', 35, 80, 11, 0, 0, 3],
    ['Encargado de turno', 'Coordina la tienda Aurora durante el turno de noche.', 'wp-tienda-24h', 50, 180, 14, 2, 0.05, 6]], 'aurora'],
  investigador: ['okami', [
    ['Análisis de muestras', 'Analiza muestras en Laboratorios Okami.', 'wp-lab-okami', 40, 170, 14, 0, 0, 4],
    ['Ensayo de biocompatibilidad', 'Prueba la tolerancia a nuevos implantes.', 'wp-lab-ensayos', 45, 210, 15, 1, 0.05, 5],
    ['Investigación neural', 'Mapea respuestas neurales en el laboratorio de Teselia.', 'wp-teselia-lab', 50, 260, 16, 1, 0, 6],
    ['Informe de prótesis', 'Estudia el desgaste de prótesis de segunda mano en el taller de Ruiz.', 'wp-ruiz', 35, 130, 13, 0, 0, 4],
    ['Dirección de proyecto', 'Presenta resultados a la dirección de Okami.', 'wp-lab-okami', 60, 380, 18, 3, 0, 8]], 'okami'],
  musico: ['calle', [
    ['Concierto en el Voltio', 'Toca un set completo en el escenario del Voltio.', 'wp-escenario-voltio', 50, 150, 14, 0, 0.05, 5],
    ['Música callejera en Lumen', 'Toca por propinas en el Mercado Lumen.', 'wp-mercado-lumen', 30, 50, 10, 0, 0, 2],
    ['Ambientar El Relé', 'Toca para la clientela de Nadia.', 'wp-bar-rele', 40, 100, 12, 0, 0, 4],
    ['Anuncio corporativo', 'Graba un jingle para Aurora en la plaza.', 'wp-plaza-cenit', 35, 160, 14, 1, 0, 5],
    ['Noche de cabeza de cartel', 'Encabeza el cartel del Voltio.', 'wp-escenario-voltio', 60, 320, 17, 3, 0.05, 8]], 'hojas-rojas'],
  cazarrecompensas: ['pcv', [
    ['Revisar órdenes de captura', 'Estudia los expedientes de fugitivos en la comisaría.', 'wp-comisaria', 30, 60, 11, 0, 0, 3],
    ['Vigilar a un sospechoso', 'Sigue a un sospechoso por la esquina de Kanal.', 'wp-esquina-kanal', 40, 140, 14, 0, 0.15, 4],
    ['Entregar un detenido', 'Lleva a un detenido a los calabozos.', 'wp-comisaria-calabozos', 35, 120, 13, 0, 0.05, 4],
    ['Batida en el desguace', 'Rastrea un escondite de fugitivos en el desguace.', 'wp-desguace', 45, 230, 16, 1, 0.25, 6],
    ['Información en el Pachinko', 'Compra información sobre fugitivos en el Pachinko.', 'wp-sala-pachinko', 40, 180, 15, 1, 0.15, 5]], 'pcv'],
  vagabundo: ['calle', [
    ['Recoger chatarra en los muelles', 'Busca metal aprovechable entre los contenedores.', 'wp-muelles-ferro', 30, 25, 9, 0, 0.05, 2],
    ['Pedir en la avenida', 'Pide limosna a los oficinistas de Cénit.', 'wp-avenida-cenit', 30, 30, 10, 0, 0.05, 2],
    ['Limpiar el mercado', 'Barre el Mercado Lumen a cambio de sobras y unas monedas.', 'wp-mercado-lumen', 35, 30, 9, 0, 0, 2],
    ['Recados en Kanal', 'Hace recados para los locales de Kanal.', 'wp-esquina-kanal', 35, 45, 11, 0, 0.1, 3],
    ['Guardar sitio en la cola', 'Guarda cola en la Clínica Okami para un ejecutivo.', 'wp-plaza-cenit', 40, 60, 10, 0, 0, 3]], 'calle'],
  chatarrero: ['chatarreros', [
    ['Desmontar coches', 'Desmonta coches en el desguace de Tomás.', 'wp-desguace', 40, 90, 12, 0, 0.05, 3],
    ['Separar metales', 'Clasifica metales en el desguace del almacén.', 'wp-almacen-chatarra', 35, 80, 11, 0, 0, 3],
    ['Recuperar cableado', 'Saca cobre de las grúas viejas del muelle.', 'wp-muelles-ferro', 40, 100, 13, 0, 0.1, 4],
    ['Despiece de drones', 'Despieza drones dados de baja en Aurora.', 'wp-logistica-muelle', 45, 140, 14, 1, 0, 5],
    ['Subasta de piezas', 'Vende piezas recuperadas en la trastienda del Pachinko.', 'wp-trastienda', 40, 170, 15, 2, 0.1, 6]], 'chatarreros'],
  mensajero: ['aurora', [
    ['Entrega urgente en Cénit', 'Lleva un paquete urgente a la recepción del Nido.', 'wp-recepcion-nido', 30, 70, 11, 0, 0, 2],
    ['Correo del mercado', 'Reparte correo entre los puestos de Lumen.', 'wp-mercado-lumen', 30, 60, 10, 0, 0, 2],
    ['Paquete para Nadia', 'Entrega un sobre sellado en El Relé.', 'wp-bar-rele', 30, 90, 12, 0, 0.05, 3],
    ['Reparto en Kanal', 'Reparte pedidos de Ramen Kanal.', 'wp-sala-ramen', 30, 70, 11, 0, 0.05, 2],
    ['Mensajería corporativa', 'Lleva documentos entre Halcón y Teselia.', 'wp-teselia-oficina', 40, 150, 14, 1, 0, 4]], 'aurora'],
  buscavidas: ['hojas-rojas', [
    ['Mover «Neblina» ficticia', 'Entrega un lote de una sustancia ficticia en Kanal (ilegal).', 'wp-esquina-kanal', 35, 220, 15, 0, 0.3, 5],
    ['Contrabando en el muelle', 'Saca un contenedor sin declarar del muelle (ilegal).', 'wp-muelles-ferro', 45, 280, 16, 1, 0.3, 6],
    ['Timbas del Pachinko', 'Trabaja de gancho en una timba amañada (ilegal).', 'wp-sala-pachinko', 40, 200, 15, 0, 0.2, 5],
    ['Piezas sin factura', 'Coloca piezas robadas a Tomás (ilegal).', 'wp-desguace', 35, 180, 14, 0, 0.25, 5],
    ['Falsificar credenciales', 'Falsifica pases de acceso corporativos (ilegal).', 'wp-trastienda', 50, 360, 17, 2, 0.35, 8]], 'hojas-rojas'],
};
const jobs = [];
for (const [prof, [employer, list]] of Object.entries(J)) {
  list.forEach(([title, desc, workplace, seconds, pay, dv, minRank, risk, cooldown], i) => {
    if (!workplaces.some((w) => w.id === workplace)) throw new Error(`puesto desconocido ${workplace}`);
    jobs.push({ id: `${prof}-${i + 1}`, title, desc, profession: prof, employer, workplace, seconds, pay, dv, minRank, legal: prof !== 'buscavidas', cooldownGameHours: cooldown, risk });
  });
}
if (jobs.length !== 100) throw new Error(`se esperaban 100 empleos, hay ${jobs.length}`);
write('jobs.json', jobs);

// ---------------------------------------------------------------- PNJ de matasanos y sus diálogos
const npcs = read('npcs.json').filter((n) => !n.generated);
const dialogs = read('dialogs.json');
const locale = read('locale/es.json');
const docs = [
  ['brann', 'Brann «El Carnicero»', 'Matasanos sin escrúpulos', 'carnicero-int', [4, 4], 'carnicero', { skin: '#d8b090', hair: '#5a1a1a', jacket: '#7a2a2a', accent: '#ff5a5a' },
    'Brann se limpia las manos en un delantal que fue blanco. «¿Cromo nuevo, cromo usado, cromo de otro? Aquí no pregunto. Tú tampoco.»'],
  ['iruka', 'Mama Iruka', 'Matasanos de barrio', 'iruka-int', [4, 4], 'iruka', { skin: '#a8805a', hair: '#e8e8e8', jacket: '#2f6b4f', accent: '#5affc8' },
    'Mama Iruka te mira por encima de las gafas. «Si es robado me lo dices, que cobro más pero no te mato. Siéntate.»'],
  ['ruiz', 'Ernesto Ruiz', 'Protésico', 'ruiz-int', [4, 4], 'ruiz', { skin: '#c89070', hair: '#3a3a3a', jacket: '#574a3a', accent: '#ff8a3d' },
    'Ruiz levanta la vista del banco. «Prótesis honradas y cromo básico. Nada robado, nada militar. ¿Qué te falta?»'],
  ['ito', 'Dra. Hanae Ito', 'Cirujana de la Clínica Okami', 'clinica-okami-int', [5, 3], 'okami', { skin: '#f0d0b0', hair: '#1a1a1a', jacket: '#e8f0f0', accent: '#5affc8' },
    'La doctora Ito sonríe con amabilidad profesional. «Bienvenida a Okami. Calidad garantizada, procedencia verificada y tarifa corporativa.»'],
  ['vex', 'Dr. Vex', 'Matasanos clandestino', 'vex-int', [4, 4], 'vex', { skin: '#b0a0c0', hair: '#b46cff', jacket: '#3a3040', accent: '#b46cff' },
    'El Dr. Vex no levanta la vista de su pantalla. «Trabajo bien con quien me cae bien. Si las Hojas Rojas te quieren mal, búscate a otro.»'],
];
for (const [id, name, title, zone, at, clinic, appearance, text] of docs) {
  npcs.push({ id, name, title, dialog: `matasanos-${id}`, appearance, generated: true, schedule: [{ from: 0, to: 24, zone, at, state: 'work', label: 'Atiende la consulta' }] });
  dialogs[`matasanos-${id}`] = { speaker: id, entries: [{ if: [], node: 'root' }], nodes: { root: { text: `doc.${id}.root`, options: [
    { id: 'clinic', text: 'doc.opt.clinic', effects: [{ open: 'clinic', id: clinic }] }, { id: 'leave', text: 'opt.leave' }] } } };
  locale[`doc.${id}.root`] = text;
}
locale['doc.opt.clinic'] = 'Ver servicios: implantes, retirada y precios.';
// Doc Sato también opera.
dialogs.sato.nodes.root.options = dialogs.sato.nodes.root.options.filter((o) => o.id !== 'chrome');
dialogs.sato.nodes.root.options.splice(2, 0, { id: 'chrome', text: 'sato.opt.chrome', effects: [{ open: 'clinic', id: 'sato' }] });
write('npcs.json', npcs);
write('dialogs.json', dialogs);
write('locale/es.json', locale);
console.log(`Generados ${zones.length} interiores, ${workplaces.length} puestos, ${jobs.length} empleos y ${docs.length} matasanos.`);
