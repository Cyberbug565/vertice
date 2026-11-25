// v0.44 · Punto de mira y miras de las armas en tercera y primera persona.
// Sin mira: un punto en el centro de la pantalla. Al apuntar (clic derecho) con una mira montada, se ve a través de ella:
// alza de hierro con puntos de tritio, holográfico 1,2× (punto rojo), holográfico 1,4× (anillo), óptica recortada 4×
// (chevrón) y visor de francotirador 8× (retícula mil-dot), con el aumento en la cámara.
import { h } from './dom';

const NS = 'http://www.w3.org/2000/svg';
const svg = (inner: string) => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '-100 -100 200 200'); s.innerHTML = inner; return s; };
const RED = '#ff3b3b', GRN = '#7dff6a', AMB = '#ffb43b';

const RETICLES: Record<string, string> = {
  // Alza y guion: el punto del guion queda en el centro, entre los dos de la muesca.
  hierro: `<g transform="scale(0.5)">
    <rect x="-62" y="10" width="50" height="90" rx="3" fill="#15171b" stroke="#2b2f36" stroke-width="1.5"/>
    <rect x="12" y="10" width="50" height="90" rx="3" fill="#15171b" stroke="#2b2f36" stroke-width="1.5"/>
    <circle cx="-22" cy="18" r="2.6" fill="${GRN}" opacity="0.9"/><circle cx="22" cy="18" r="2.6" fill="${GRN}" opacity="0.9"/>
    <path d="M-4 1 L4 1 L6 100 L-6 100 Z" fill="#1c1f24" stroke="#30353d" stroke-width="1"/>
    <circle cx="0" cy="4" r="2.4" fill="${GRN}"/></g>`,
  // Holográfico Halo 1,2×: ventana rectangular y punto rojo.
  holo: `
    <rect x="-74" y="-52" width="148" height="104" rx="10" fill="rgba(130,200,255,0.05)" stroke="#16191e" stroke-width="12"/>
    <rect x="-74" y="-52" width="148" height="104" rx="10" fill="none" stroke="#2c323b" stroke-width="2"/>
    <rect x="-30" y="52" width="60" height="30" fill="#16191e"/>
    <circle cx="0" cy="0" r="5" fill="${RED}" opacity="0.25"/><circle cx="0" cy="0" r="1.9" fill="${RED}"/>`,
  // Holográfico Vanguardia 1,4×: ventana más grande, anillo de 65 MOA con marcas y punto.
  'holo-anillo': `
    <path d="M-80 -40 L-60 -60 L60 -60 L80 -40 L80 48 L-80 48 Z" fill="rgba(140,255,220,0.05)" stroke="#16191e" stroke-width="12" stroke-linejoin="round"/>
    <path d="M-80 -40 L-60 -60 L60 -60 L80 -40 L80 48 L-80 48 Z" fill="none" stroke="#2c323b" stroke-width="2"/>
    <rect x="-34" y="48" width="68" height="34" fill="#16191e"/>
    <circle cx="0" cy="0" r="22" fill="none" stroke="${RED}" stroke-width="1.6" opacity="0.95"/>
    <g stroke="${RED}" stroke-width="1.6"><line x1="0" y1="-22" x2="0" y2="-16"/><line x1="0" y1="22" x2="0" y2="16"/><line x1="-22" y1="0" x2="-16" y2="0"/><line x1="22" y1="0" x2="16" y2="0"/></g>
    <circle cx="0" cy="0" r="1.7" fill="${RED}"/>`,
  // Óptica recortada Corsario 4×: chevrón iluminado y líneas de distancia.
  tactica: `
    <circle cx="0" cy="0" r="98" fill="none" stroke="#0b0c0e" stroke-width="4"/>
    <g stroke="#0d0f12" stroke-width="1.4"><line x1="-98" y1="0" x2="-30" y2="0"/><line x1="30" y1="0" x2="98" y2="0"/><line x1="0" y1="20" x2="0" y2="98"/></g>
    <g stroke="#0d0f12" stroke-width="1"><line x1="-6" y1="30" x2="6" y2="30"/><line x1="-5" y1="42" x2="5" y2="42"/><line x1="-4" y1="54" x2="4" y2="54"/></g>
    <polyline points="-9,10 0,0 9,10" fill="none" stroke="${AMB}" stroke-width="2" stroke-linejoin="miter"/>
    <polyline points="-9,10 0,0 9,10" fill="none" stroke="${AMB}" stroke-width="6" opacity="0.18"/>`,
  // Visor Vigía 8×: cruz fina con postes gruesos y puntos mil-dot.
  francotirador: `
    <circle cx="0" cy="0" r="98" fill="none" stroke="#050506" stroke-width="5"/>
    <g stroke="#050506"><line x1="-98" y1="0" x2="-48" y2="0" stroke-width="4"/><line x1="48" y1="0" x2="98" y2="0" stroke-width="4"/><line x1="0" y1="48" x2="0" y2="98" stroke-width="4"/><line x1="0" y1="-98" x2="0" y2="-48" stroke-width="4"/>
      <line x1="-48" y1="0" x2="48" y2="0" stroke-width="0.6"/><line x1="0" y1="-48" x2="0" y2="48" stroke-width="0.6"/></g>
    <g fill="#050506">${[-40, -30, -20, -10, 10, 20, 30, 40].map((d) => `<circle cx="${d}" cy="0" r="1.3"/><circle cx="0" cy="${d}" r="1.3"/>`).join('')}</g>
    <circle cx="0" cy="0" r="1" fill="${RED}"/>`,
};
/** Viñeta de las ópticas (todo negro fuera del tubo); los holográficos y el hierro no la tienen. */
const SCOPE = new Set(['tactica', 'francotirador']);

export function createSights() {
  const dot = h('div', { class: 'crosshair', style: { display: 'none' } }); // el punto (clase heredada de la v0.39)
  const view = h('div', { class: 'sight-ov', style: { display: 'none' } });
  const glass = h('div', { class: 'sight-glass' });
  const ret = h('div', { class: 'sight-ret' });
  view.append(glass, ret);
  let cur = '';
  return {
    els: [dot, view] as HTMLElement[],
    update(s: { near: boolean; ads: number; sight: { zoom: number; reticle: string } | null; ranged: boolean }) {
      const through = s.near && s.ranged && !!s.sight && s.ads > 0.35;
      // v0.45 · Mirando por la mira: fuera todo el HUD menos las barras de salud y aguante.
      document.body.classList.toggle('scoped', through);
      dot.style.display = s.near && !through ? '' : 'none';
      dot.classList.toggle('aiming', s.near && s.ads > 0.5);
      if (!through) { if (view.style.display !== 'none') view.style.display = 'none'; return; }
      const r = s.sight!.reticle;
      if (r !== cur) { cur = r; ret.replaceChildren(svg(RETICLES[r] ?? RETICLES.holo)); view.dataset.reticle = r; view.classList.toggle('scope', SCOPE.has(r)); }
      view.style.display = '';
      view.style.opacity = String(Math.min(1, (s.ads - 0.35) / 0.4));
    },
  };
}
