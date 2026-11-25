// v0.45 · Constantes vitales del HUD, sin panel detrás: dos barras continuas (salud y aguante) y tres anillos para el
// hambre, la sed y el sueño. Cada anillo está lleno cuando estás bien y se vacía a medida que la necesidad aprieta.
// Las cifras solo aparecen mientras mantienes la tecla de «ver cifras» (Alt por defecto).
import { h } from './dom';

const NS = 'http://www.w3.org/2000/svg';
const icon = (path: string) => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = path; return s; };
// Iconos de línea propios: cubiertos (hambre), gota (sed) y luna (sueño).
const ICONS = {
  hunger: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-2.5 4-2.5 7h2.5v11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  thirst: '<path d="M12 3.5c3.2 4.2 5.5 7.3 5.5 10.3a5.5 5.5 0 0 1-11 0c0-3 2.3-6.1 5.5-10.3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.6 14.6a2.6 2.6 0 0 0 2.2 2.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  fatigue: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 4.5h3l-3 3.5h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
};
const NAMES = { hunger: 'Hambre', thirst: 'Sed', fatigue: 'Sueño' } as const;
type Need = keyof typeof NAMES;

export function createVitals() {
  const bar = (cls: string, label: string) => {
    const fill = h('i'), ghost = h('em'), num = h('span', { class: 'vnum mono' });
    const el = h('div', { class: `vbar ${cls}`, role: 'meter', 'aria-label': label }, ghost, fill, num);
    let last = -1;
    return {
      el,
      set(v: number, max: number) {
        const pct = Math.max(0, Math.min(100, (100 * v) / Math.max(1, max)));
        fill.style.width = `${pct}%`;
        // Lo perdido se queda un momento en un tono claro y luego se va (para que se note un golpe).
        if (last >= 0 && pct < last) { ghost.style.transition = 'none'; ghost.style.width = `${last}%`; void ghost.offsetWidth; ghost.style.transition = ''; }
        requestAnimationFrame(() => { ghost.style.width = `${pct}%`; });
        last = pct;
        num.textContent = `${Math.round(v)}/${max}`;
        el.setAttribute('aria-valuenow', String(Math.round(pct)));
        el.classList.toggle('low', pct <= 25);
      },
    };
  };
  const ring = (k: Need) => {
    const num = h('b', { class: 'vnum mono' });
    const el = h('div', { class: `vring ${k}`, role: 'meter', 'aria-label': NAMES[k], title: NAMES[k] }, icon(ICONS[k]), num);
    return {
      el,
      /** need: 0 = satisfecho, 100 = crítico. El anillo muestra lo que te queda (100 − need). */
      set(need: number) {
        const left = Math.max(0, Math.min(100, 100 - need));
        el.style.setProperty('--p', String(left));
        num.textContent = `${Math.round(left)}%`;
        el.setAttribute('aria-valuenow', String(Math.round(left)));
        el.classList.toggle('low', left <= 25);
        el.classList.toggle('crit', left <= 8);
      },
    };
  };
  const hp = bar('hp', 'Salud'), st = bar('st', 'Aguante');
  const rings = { hunger: ring('hunger'), thirst: ring('thirst'), fatigue: ring('fatigue') };
  const needsEl = h('div', { class: 'vrings hud-needs' }, rings.hunger.el, rings.thirst.el, rings.fatigue.el);
  const el = h('div', { class: 'vitals', id: 'vitals', 'aria-label': 'Constantes vitales' }, hp.el, st.el, needsEl);
  return {
    el,
    hp: (v: number, max: number) => hp.set(v, max),
    stamina: (v: number, max: number) => st.set(v, max),
    needs: (n: { hunger: number; thirst: number; fatigue: number }) => { rings.hunger.set(n.hunger); rings.thirst.set(n.thirst); rings.fatigue.set(n.fatigue); },
    /** Muestra u oculta las cifras (mientras se mantiene la tecla). */
    numbers: (on: boolean) => el.classList.toggle('nums', on),
  };
}
