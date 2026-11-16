// v0.5 · Paneles de trabajo fijo (contratación), ascensor de las torres y modo automático.
import type { ElevatorView, HiringView } from '@vertice/shared';
import type { Net } from '../net';
import { fmtMoney, h } from './dom';
import { showPanel } from './life';

const ACCESS: Record<string, [string, string]> = { publico: ['Pública', '#5affc8'], empleados: ['Solo personal', '#ffd23f'], restringido: ['Restringida', '#ff3040'] };
const PERS: [string, string, string][] = [
  ['responsable', '🧑‍💼 Responsable', 'Cumple su horario, duerme en sitio seguro y evita líos. Solo trabajos legales y tranquilos.'],
  ['ambicioso', '💰 Ambicioso/a', 'Persigue el dinero: acepta los encargos mejor pagados aunque tengan algo de riesgo.'],
  ['temerario', '🔥 Temerario/a', 'Le da igual la ley: trabajos ilegales, peleas y algún robo por la noche. Gana más… o acaba mal.'],
  ['tranquilo', '🌿 Tranquilo/a', 'Trabaja lo justo, descansa mucho y pasea por la ciudad.'],
];

export function hiringPanel(net: Net, v: HiringView) {
  const cards = v.posts.map((p) => h('div', { class: `fcard${p.holder === 'tú' ? ' on' : ''}`, style: { borderTopColor: p.holder ? (p.holder === 'tú' ? '#5affc8' : '#ff5a5a') : '#43f3ff' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, p.name.split(' · ')[0]), h('span', { class: 'chip' }, p.holder ? (p.holder === 'tú' ? 'TUYO' : 'OCUPADO') : 'LIBRE')),
    h('div', { class: 'small muted' }, p.desc),
    h('div', { class: 'small' }, `🕘 ${p.shift} · ${fmtMoney(p.pay)} por turno · ${p.employer}`),
    h('div', { class: 'small' }, `Requisito: ${p.skill} ${p.minLevel} `, h('span', { class: p.level >= p.minLevel ? 'netok' : 'netbad' }, `(tienes ${p.level})`)),
    p.holder && p.holder !== 'tú' ? h('div', { class: 'small netbad' }, `Lo ocupa ${p.holder}`) : null,
    p.canApply ? h('button', { class: 'btn small primary', onclick: () => net.send({ t: 'post', action: 'apply', post: p.id, obj: undefined } as any) }, 'Pedir el puesto')
      : p.holder === 'tú' ? h('button', { class: 'btn small danger', onclick: () => { if (confirm('¿Dejar el puesto? Quedará libre para otra persona.')) net.send({ t: 'post', action: 'quit' } as any); } }, 'Dejar el puesto')
        : h('div', { class: 'small muted' }, p.reason)));
  showPanel('hiring-panel', `¿Hay trabajo? · ${v.place}`,
    h('p', { class: 'muted' }, 'Puestos fijos con horario de la ciudad (un día dura 1 h 30 min reales). Cada puesto es de una sola persona: si está ocupado, toca esperar a que quede libre. Cobras cada turno que trabajes en tu horario.'),
    v.mine ? h('p', {}, h('b', {}, 'Tu puesto actual: '), `${v.mine.name} (${v.mine.shift})`) : null,
    v.posts.length ? h('div', { class: 'cards' }, ...cards) : h('p', { class: 'muted' }, 'Ahora mismo no buscan a nadie aquí.'));
}

export function elevatorPanel(net: Net, v: ElevatorView) {
  const rows = [...v.floors].reverse().map((f) => {
    const [label, color] = ACCESS[f.access];
    return h('div', { class: `floor${f.floor === v.current ? ' here' : ''}`, style: { borderLeftColor: color } },
      h('span', { class: 'mono floor-n' }, f.floor === 0 ? 'V' : String(f.floor)), h('span', { class: 'floor-name' }, f.name), h('span', { class: 'chip', style: { color } }, label),
      f.floor === v.current ? h('span', { class: 'small muted' }, 'estás aquí')
        : f.allowed ? h('button', { class: 'btn small primary', onclick: () => { net.send({ t: 'elevator', floor: f.floor } as any); document.getElementById('elevator-panel')?.remove(); } }, 'Subir')
          : h('button', { class: 'btn small danger', title: 'Hackear el ascensor (Interfaz). Si falla, salta la alarma.', onclick: () => { if (confirm('¿Hackear el ascensor? Si falla saltará la alarma, y arriba la seguridad te tratará como intruso.')) { net.send({ t: 'elevator', floor: f.floor, hack: true } as any); document.getElementById('elevator-panel')?.remove(); } } }, '💻 Hackear'));
  });
  showPanel('elevator-panel', `Ascensor · ${v.name}`, h('p', { class: 'muted' }, 'Plantas públicas para todos; las de personal, con un puesto en la corporación o buena relación (+10); las restringidas, con mucha confianza (+40)… o hackeando.'), h('div', { class: 'floors' }, ...rows));
}

export function autoPanel(current: string, onPick: (personality: string) => void) {
  showPanel('auto-panel', '🤖 Modo automático',
    h('p', { class: 'muted' }, 'La IA controla a tu personaje según su personalidad: come y bebe, duerme, va a su puesto en su horario, acepta encargos de su oficio y asume los riesgos que su carácter le permite. Cualquier orden tuya (moverte, interactuar…) lo desactiva.'),
    h('div', { class: 'cards' }, ...PERS.map(([id, name, desc]) => h('button', { class: `fcard choice${id === current ? ' on' : ''}`, style: { textAlign: 'left' }, onclick: () => { onPick(id); document.getElementById('auto-panel')?.remove(); } }, h('b', {}, name), h('div', { class: 'small muted' }, desc)))));
}
