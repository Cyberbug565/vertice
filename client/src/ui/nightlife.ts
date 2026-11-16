import { DANCES, DANCE_IDS, type DanceId, type SubstanceView } from '@vertice/shared';
import { $ui, h } from './dom';

export function closeDanceMenus() {
  const active = document.getElementById('dance-wheel') ?? document.getElementById('world-actions');
  active?.remove();
  return !!active;
}

export function worldActions(x: number, y: number, dance: () => void, cancel: () => void) {
  closeDanceMenus();
  const menu = h('div', { id: 'world-actions', class: 'target-menu', role: 'group', 'aria-label': 'Acciones del personaje' });
  menu.append(
    h('button', { class: 'btn primary', onclick: dance }, 'Bailar'),
    h('button', { class: 'btn', onclick: () => { menu.remove(); cancel(); } }, 'Cancelar orden'),
  );
  $ui().append(menu);
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
  menu.querySelector('button')?.focus({ preventScroll: true });
}

export function danceWheel(current: DanceId | null, choose: (choice: DanceId | null) => void) {
  closeDanceMenus();
  const description = h('p', {}, 'Selecciona un paso');
  const heading = h('h2', { id: 'dance-title' }, 'Bailar');
  const close = () => closeDanceMenus();
  const select = (choice: DanceId | null) => { close(); choose(choice); };
  const center = h('div', { class: 'dance-center' }, heading, description,
    h('button', { class: 'btn small', onclick: current ? () => select(null) : close }, current ? 'Dejar de bailar' : 'Cerrar'));
  const steps: HTMLButtonElement[] = [];
  for (const [i, id] of DANCE_IDS.entries()) {
    const move = DANCES[id], angle = i * Math.PI / 3;
    const preview = () => { heading.textContent = move.name; description.textContent = move.detail; };
    steps.push(h('button', {
      class: 'dance-step', 'aria-label': move.name, 'aria-pressed': String(id === current),
      style: { left: `${50 + 35 * Math.sin(angle)}%`, top: `${50 - 35 * Math.cos(angle)}%` },
      onpointerenter: preview, onfocus: preview, onclick: () => select(id),
    }, h('span', { 'aria-hidden': 'true' }, move.icon), h('b', {}, move.name)));
  }
  const wheel = h('div', { class: 'dance-wheel' }, center, ...steps);
  const overlay = h('div', { id: 'dance-wheel', class: 'dance-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Elegir baile',
    onclick: (ev: MouseEvent) => { if (ev.target === overlay) close(); },
    onkeydown: (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(ev.key)) return;
      const buttons = ev.key === 'Tab' ? [...steps, center.querySelector('button')!] : steps;
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const delta = (ev.key === 'Tab' && ev.shiftKey) || ['ArrowLeft', 'ArrowUp'].includes(ev.key) ? -1 : 1;
      ev.preventDefault();
      ev.stopPropagation();
      buttons[i < 0 ? 0 : (i + delta + buttons.length) % buttons.length].focus();
    },
  }, wheel);
  $ui().append(overlay);
  steps[Math.max(0, DANCE_IDS.indexOf(current ?? DANCE_IDS[0]))].focus({ preventScroll: true });
}

export function substanceReadout(state: SubstanceView) {
  const rows: HTMLElement[] = [];
  if (state.sick) rows.push(h('div', { class: 'netbad' }, 'Vómitos · descansa unos segundos'));
  if (state.drunk) rows.push(h('div', { class: state.drunk >= 50 ? 'netbad' : 'netmid' }, `Embriaguez ${state.drunk} %`));
  if (state.hangover) rows.push(h('div', { class: 'netmid' }, 'Resaca'));
  for (const effect of state.effects) {
    const label = [effect.phase === 'active' ? 'efecto activo' : effect.phase === 'crash' ? 'bajón' : '',
      effect.dependent ? effect.withdrawal ? 'abstinencia' : 'dependencia' : ''].filter(Boolean).join(' · ');
    rows.push(h('div', { class: effect.withdrawal || effect.phase === 'crash' ? 'netbad' : 'cy' }, `${effect.name} · ${label}`));
  }
  if (state.aim) rows.push(h('div', { class: 'mono ' + (state.aim < 0 ? 'netbad' : 'netok') }, `Puntería ${state.aim > 0 ? '+' : '−'}${Math.abs(state.aim)}`));
  return rows;
}
