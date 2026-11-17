// v0.10 · Barra de sigilo bajo el minimapa (estado, sospecha, quién te busca) y ruleta de armas (R).
import type { CharacterSheet, StealthView } from '@vertice/shared';
import { content } from '../content';
import { h } from './dom';

const STATE: Record<StealthView['state'], { icon: string; label: string; color: string; tip: string }> = {
  oculto: { icon: '◌', label: 'OCULTO', color: '#5affc8', tip: 'Nadie te ve.' },
  visto: { icon: '👁', label: 'VISTO', color: '#e8f0ff', tip: 'Alguien te ve, pero no sospecha.' },
  sospecha: { icon: '⚠', label: 'BAJO SOSPECHA', color: '#ffd23f', tip: 'Te observan: aléjate, guarda el arma o tápate la cara.' },
  descubierto: { icon: '🚨', label: 'DESCUBIERTO', color: '#ff3040', tip: 'Van a por ti. Escóndete y cámbiate de ropa.' },
  buscado: { icon: '🔎', label: 'TE BUSCAN', color: '#ff8a3d', tip: 'Te buscan, pero ahora no te ven.' },
  combate: { icon: '⚔', label: 'EN COMBATE', color: '#ff5a5a', tip: 'Combate en curso.' },
};
const RESTRICTED: Record<string, string> = { policia: 'Comisaría', banco: 'Banco', carcel: 'Penal', corporativo: 'Zona corporativa', laboratorio: 'Laboratorio' };

export function stealthBar() {
  const el = h('div', { class: 'stealth-bar', id: 'stealth-bar' });
  const render = (v: StealthView) => {
    const s = STATE[v.state];
    el.style.setProperty('--sc', s.color);
    el.classList.toggle('alert', v.state === 'descubierto');
    el.replaceChildren(
      h('div', { class: 'sb-head', title: s.tip }, h('span', { class: 'sb-ico' }, s.icon), h('b', {}, s.label), h('span', { class: 'sb-pct mono' }, `${v.suspicion}%`)),
      h('div', { class: 'sb-meter' }, h('i', { style: { width: `${v.suspicion}%` } })),
      h('div', { class: 'sb-chips' },
        v.restricted ? h('span', { class: 'chip warn', title: 'Lugar restringido: los guardias sospechan de quien no lleva el uniforme adecuado.' }, `⛔ ${RESTRICTED[v.restricted] ?? v.restricted}`) : null,
        v.disguise ? h('span', { class: 'chip good', title: 'Disfraz' }, `🥸 ${v.disguise}`) : null,
        h('span', { class: `chip ${v.armed === 'ninguna' ? 'good' : v.armed === 'empuñada' ? 'bad' : 'warn'}`, title: 'Armas encima (el cromo integrado no cuenta)' }, v.armed === 'ninguna' ? '🖐 Sin armas a la vista' : v.armed === 'empuñada' ? '🔫 Arma empuñada' : '🎒 Armas a la vista'),
        h('span', { class: `chip ${v.faceCovered ? 'good' : ''}`, title: 'Con la cara tapada no te reconocen de cerca' }, v.faceCovered ? '😷 Cara tapada' : '🙂 Cara visible'),
        v.described ? h('span', { class: 'chip bad', title: 'Los testigos han dado tu descripción: cámbiate de ropa' }, '📝 Encajas con la descripción') : null),
      v.hunters.length ? h('div', { class: 'sb-hunters' }, h('div', { class: 'sb-hl' }, 'TE BUSCAN'), ...v.hunters.map((x) => h('div', { class: 'sb-hunter', style: { color: x.color } }, h('span', {}, x.icon), ` ${x.name}`))) : '');
  };
  render({ state: 'oculto', suspicion: 0, observers: [], hunters: [], faceCovered: false, described: false, armed: 'ninguna' });
  return { el, render };
}

/** Ruleta de armas: las que llevas encima, las integradas en el cromo y «manos vacías». Se elige con el ratón. */
export function weaponWheel(sheet: CharacterSheet, onPick: (item: string | null) => void) {
  document.getElementById('weapon-wheel')?.remove();
  const list: { id: string | null; name: string; icon: string; note: string; integrated?: boolean }[] = [{ id: null, name: 'Manos vacías', icon: '🖐', note: 'Sin nada en la mano' }];
  for (const w of sheet.weapons) {
    const d = content.items.find((i) => i.id === w.id);
    const fam = d?.weapon?.family ?? '';
    const icon = w.integrated ? '🦾' : /Rifle|Ametralladora|Subfusil/.test(fam) ? '🔫' : /Escopeta/.test(fam) ? '💥' : /Pistola|Revólver/.test(fam) ? '🔫' : /Hoja|Cuchillo/.test(fam) ? '🗡' : /Arco/.test(fam) ? '🏹' : d?.weapon?.kind === 'ranged' ? '🔫' : '🔨';
    list.push({ id: w.id, name: w.name, icon, integrated: w.integrated, note: w.integrated ? 'Cromo: el detector no la ve' : d?.weapon?.kind === 'melee' ? 'Cuerpo a cuerpo: casi no se oye' : d?.weapon?.traits?.includes('silenciosa') ? `Silenciosa: ~${Math.round((8 + (d?.weapon?.noise ?? 0.5) * 32) * 0.3)} m` : `Se oye a ~${Math.round(8 + (d?.weapon?.noise ?? 0.5) * 32)} m` });
  }
  const R = 150, n = list.length;
  const wheel = h('div', { class: 'weapon-wheel', id: 'weapon-wheel', role: 'menu', 'aria-label': 'Ruleta de armas' });
  const center = h('div', { class: 'ww-center' }, h('b', {}, 'ARMAS'), h('span', { class: 'muted small' }, 'Elige con el ratón'));
  wheel.append(center);
  let sel = -1;
  const items = list.map((it, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const b = h('button', { class: `ww-item${(sheet.weapon?.id ?? null) === it.id ? ' on' : ''}${it.integrated ? ' chrome' : ''}`, style: { left: `calc(50% + ${Math.cos(a) * R}px)`, top: `calc(50% + ${Math.sin(a) * R}px)` },
      onclick: () => { onPick(it.id); wheel.remove(); } }, h('span', { class: 'ww-ico' }, it.icon), h('span', { class: 'ww-name' }, it.name), h('span', { class: 'ww-note' }, it.note));
    b.addEventListener('mouseenter', () => { sel = i; center.replaceChildren(h('b', {}, it.name), h('span', { class: 'muted small' }, it.note)); });
    wheel.append(b);
    return b;
  });
  // Selección por la dirección del ratón respecto al centro (como una ruleta de verdad).
  wheel.addEventListener('mousemove', (ev) => {
    const r = wheel.getBoundingClientRect(); const dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < 40) return;
    const ang = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const i = Math.round((ang / (Math.PI * 2)) * n) % n;
    if (i !== sel) { sel = i; items.forEach((b, k) => b.classList.toggle('hover', k === i)); center.replaceChildren(h('b', {}, list[i].name), h('span', { class: 'muted small' }, list[i].note)); }
  });
  wheel.addEventListener('click', (ev) => { if (ev.target === wheel && sel >= 0) { onPick(list[sel].id); wheel.remove(); } });
  document.body.append(wheel);
  return { pickHovered: () => { if (sel >= 0) onPick(list[sel].id); wheel.remove(); }, close: () => wheel.remove() };
}
