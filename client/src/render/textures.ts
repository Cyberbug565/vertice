// v0.9 · Texturas procedurales de alta resolución para el personaje: tejidos de la ropa y tatuajes sobre la piel.
// Se dibujan en un lienzo a 8 píxeles por unidad del personaje (el doble en pantallas densas) y se cachean por combinación.
// Todo es original y generado en el navegador: no hay imágenes externas.
import { Texture } from 'pixi.js';

export const FABRICS = ['liso', 'cuero', 'vaquero', 'camuflaje', 'camuflaje-urbano', 'cuadros', 'punto', 'kevlar', 'carbono', 'holografico', 'lentejuelas', 'rayas', 'serpiente', 'neon',
  'malla', 'acolchado', 'pana', 'seda', 'lona', 'tactico', 'pixel', 'tigre', 'reflectante', 'circuito'] as const;
export const TATTOO_STYLES = ['ninguno', 'tribal', 'circuito', 'floral', 'codigo', 'dragon', 'calavera', 'geometrico', 'mandala', 'olas', 'llamas', 'telarana', 'alas', 'koi', 'estrellas',
  'rosa', 'serpiente', 'barras', 'glitch', 'runas', 'biomecanico', 'puntillismo', 'acuarela'] as const;

const cache = new Map<string, Texture>();
const MAX = 600;
const DPR = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
const PX = 8 * DPR; // píxeles de textura por unidad del personaje

function rgb(hex: string | number) {
  const n = typeof hex === 'number' ? hex : parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function css(hex: string | number, f = 1, a = 1) {
  const [r, g, b] = rgb(hex);
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return `rgba(${k(r)},${k(g)},${k(b)},${a})`;
}
/** Ruido determinista para que la misma prenda se vea igual en todos los clientes. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
/** v0.11 · Lienzos cacheados (los usan también los personajes 3D como texturas de Three.js). */
const canvases = new Map<string, HTMLCanvasElement>();
function makeCanvas(key: string, wu: number, hu: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void) {
  const hit = canvases.get(key);
  if (hit) return hit;
  const w = Math.max(8, Math.round(wu * PX)), h = Math.max(8, Math.round(hu * PX));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!, w, h, rng(key));
  if (canvases.size > MAX) canvases.delete(canvases.keys().next().value!);
  canvases.set(key, cv);
  return cv;
}
function make(key: string, wu: number, hu: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return Texture.WHITE;
  const cv = makeCanvas(key, wu, hu, draw);
  const t = Texture.from(cv);
  t.source.scaleMode = 'linear';
  if (cache.size > MAX) { const first = cache.keys().next().value!; cache.get(first)?.destroy(true); cache.delete(first); }
  cache.set(key, t);
  return t;
}
/** Volumen: más oscuro en los bordes y un brillo suave hacia el centro-derecha (luz desde arriba a la derecha). */
function volume(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.35, shine = 0.12) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(0.7, `rgba(255,255,255,${shine})`); g.addColorStop(1, `rgba(0,0,0,${strength * 0.6})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const v = ctx.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, 'rgba(255,255,255,0.05)'); v.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------ tejidos
function drawFabric(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, pattern: string, base: string, accent: string) {
  const u = PX; // una unidad del personaje
  ctx.fillStyle = css(base); ctx.fillRect(0, 0, w, h);
  switch (pattern) {
    case 'cuero': {
      for (let i = 0; i < w * h / 40; i++) { ctx.fillStyle = css(base, 0.8 + r() * 0.35, 0.35); ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
      ctx.strokeStyle = css(base, 0.6, 0.6); ctx.lineWidth = Math.max(1, u * 0.12);
      ctx.setLineDash([u * 0.3, u * 0.2]); ctx.strokeRect(u * 0.4, u * 0.4, w - u * 0.8, h - u * 0.8); ctx.setLineDash([]);
      const s = ctx.createLinearGradient(0, 0, w, h); s.addColorStop(0.3, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,0.22)'); s.addColorStop(0.6, 'rgba(255,255,255,0)');
      ctx.fillStyle = s; ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'vaquero': {
      for (let y = 0; y < h; y += 2) for (let x = (y / 2) % 3; x < w; x += 3) { ctx.fillStyle = css(base, 1.25, 0.35); ctx.fillRect(x, y, 1, 1); }
      for (let i = 0; i < 40; i++) { ctx.fillStyle = css(base, 1.5, 0.12); ctx.fillRect(r() * w, r() * h, u * (0.5 + r()), 1); }
      ctx.strokeStyle = css('#d8a040', 1, 0.8); ctx.lineWidth = Math.max(1, u * 0.1); ctx.setLineDash([u * 0.25, u * 0.15]);
      ctx.beginPath(); ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.5, h); ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'camuflaje': case 'camuflaje-urbano': case 'tigre': {
      const pal = pattern === 'camuflaje' ? [css(base, 0.6), css(base, 1.3), css('#3a3020', 1, 0.8)] : pattern === 'tigre' ? [css('#101010', 1, 0.9)] : [css('#202428'), css('#8a9098'), css(base, 1.4)];
      for (let i = 0; i < (pattern === 'tigre' ? 18 : 30); i++) {
        ctx.fillStyle = pal[i % pal.length]; ctx.beginPath();
        const cx = r() * w, cy = r() * h, rr = u * (0.6 + r() * 1.4);
        if (pattern === 'tigre') { ctx.moveTo(cx - rr, cy); ctx.quadraticCurveTo(cx, cy - rr * 0.3, cx + rr * 1.4, cy + rr * 0.2); ctx.quadraticCurveTo(cx, cy + rr * 0.1, cx - rr, cy); }
        else if (pattern === 'camuflaje-urbano') ctx.rect(Math.round(cx / u) * u, Math.round(cy / u) * u, u * (1 + Math.floor(r() * 3)), u * (1 + Math.floor(r() * 2)));
        else for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; const rk = rr * (0.6 + r() * 0.6); k ? ctx.lineTo(cx + Math.cos(a) * rk, cy + Math.sin(a) * rk) : ctx.moveTo(cx + rk, cy); }
        ctx.fill();
      }
      break;
    }
    case 'cuadros': {
      const s = u * 2.2;
      for (let x = 0; x < w; x += s) { ctx.fillStyle = css(accent, 1, 0.35); ctx.fillRect(x, 0, s * 0.35, h); }
      for (let y = 0; y < h; y += s) { ctx.fillStyle = css(accent, 0.6, 0.35); ctx.fillRect(0, y, w, s * 0.35); }
      for (let x = 0; x < w; x += s) { ctx.fillStyle = css('#ffffff', 1, 0.25); ctx.fillRect(x + s * 0.7, 0, 1, h); }
      break;
    }
    case 'punto': {
      for (let y = 0; y < h; y += u * 0.5) for (let x = 0; x < w; x += u * 0.6) {
        ctx.strokeStyle = css(base, (x / u + y / u) % 2 ? 1.2 : 0.85, 0.6); ctx.lineWidth = Math.max(1, u * 0.12);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + u * 0.3, y + u * 0.45); ctx.lineTo(x + u * 0.6, y); ctx.stroke();
      }
      break;
    }
    case 'kevlar': case 'tactico': {
      const s = u * 0.6;
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { ctx.fillStyle = css(base, ((x + y) / s) % 2 ? 1.18 : 0.82, 0.6); ctx.fillRect(x, y, s, s); }
      if (pattern === 'tactico') { ctx.fillStyle = css(base, 0.55, 0.9); for (let y = u * 1.5; y < h; y += u * 2) ctx.fillRect(u * 0.4, y, w - u * 0.8, u * 0.25); }
      break;
    }
    case 'carbono': {
      const s = u * 0.5;
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s * 2) { const off = (Math.floor(y / s) % 2) * s; const gr = ctx.createLinearGradient(x + off, y, x + off + s, y + s); gr.addColorStop(0, '#1a1a1e'); gr.addColorStop(1, '#4a4a54'); ctx.fillStyle = gr; ctx.fillRect(x + off, y, s, s); }
      break;
    }
    case 'holografico': {
      const g = ctx.createLinearGradient(0, 0, w, h);
      ['#ff6ad5', '#c774e8', '#ad8cff', '#8795e8', '#94d0ff', '#7affd4', '#fff3a0'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
      ctx.globalAlpha = 0.75; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      for (let i = 0; i < 20; i++) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, r() * h, w, 1); }
      break;
    }
    case 'lentejuelas': {
      for (let y = 0; y < h; y += u * 0.5) for (let x = (y / (u * 0.5)) % 2 ? u * 0.25 : 0; x < w; x += u * 0.5) {
        ctx.fillStyle = css(r() < 0.2 ? '#ffffff' : base, 0.8 + r() * 0.6, 0.9); ctx.beginPath(); ctx.arc(x, y, u * 0.2, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'rayas': {
      for (let x = 0; x < w; x += u * 1.4) { ctx.fillStyle = css(accent, 1, 0.75); ctx.fillRect(x, 0, u * 0.45, h); }
      break;
    }
    case 'serpiente': {
      for (let y = 0; y < h; y += u * 0.55) for (let x = (y / (u * 0.55)) % 2 ? u * 0.4 : 0; x < w; x += u * 0.8) {
        ctx.fillStyle = css(base, 0.75 + r() * 0.5, 1); ctx.beginPath(); ctx.ellipse(x, y, u * 0.38, u * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = css(base, 0.4, 0.7); ctx.lineWidth = 1; ctx.stroke();
      }
      break;
    }
    case 'neon': case 'reflectante': case 'circuito': {
      const c = pattern === 'reflectante' ? '#e8f0ff' : accent;
      ctx.shadowColor = css(c); ctx.shadowBlur = pattern === 'reflectante' ? 0 : u * 0.8;
      ctx.strokeStyle = css(c); ctx.lineWidth = Math.max(1, u * (pattern === 'reflectante' ? 0.35 : 0.18));
      if (pattern === 'circuito') {
        for (let i = 0; i < 9; i++) { ctx.beginPath(); let x = r() * w, y = r() * h; ctx.moveTo(x, y); for (let k = 0; k < 3; k++) { if (k % 2) x += (r() - 0.5) * u * 4; else y += (r() - 0.5) * u * 4; ctx.lineTo(x, y); } ctx.stroke(); ctx.fillStyle = css(c); ctx.beginPath(); ctx.arc(x, y, u * 0.2, 0, 7); ctx.fill(); }
      } else { for (const yy of [0.3, 0.62]) { ctx.beginPath(); ctx.moveTo(0, h * yy); ctx.lineTo(w, h * yy); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(w * 0.2, 0); ctx.lineTo(w * 0.2, h); ctx.stroke(); }
      ctx.shadowBlur = 0;
      break;
    }
    case 'malla': {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = css(base, 1.3, 0.8); ctx.lineWidth = 1;
      for (let i = -h; i < w; i += u * 0.6) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke(); }
      break;
    }
    case 'acolchado': {
      for (let y = u * 1.2; y < h; y += u * 1.6) { const g = ctx.createLinearGradient(0, y - u * 0.8, 0, y); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, y - u * 0.8, w, u * 0.8); ctx.fillStyle = css(base, 0.5); ctx.fillRect(0, y, w, Math.max(1, u * 0.1)); }
      break;
    }
    case 'pana': { for (let x = 0; x < w; x += u * 0.4) { ctx.fillStyle = css(base, x % (u * 0.8) ? 1.15 : 0.85, 0.7); ctx.fillRect(x, 0, u * 0.25, h); } break; }
    case 'seda': { const g = ctx.createLinearGradient(0, 0, w, h * 0.6); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.35)'); g.addColorStop(0.55, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.2)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); break; }
    case 'lona': { for (let y = 0; y < h; y += 2) { ctx.fillStyle = css(base, y % 4 ? 0.9 : 1.1, 0.5); ctx.fillRect(0, y, w, 1); } for (let x = 0; x < w; x += 2) { ctx.fillStyle = css(base, 0.85, 0.25); ctx.fillRect(x, 0, 1, h); } break; }
    case 'pixel': { const s = u * 0.7; for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { const t = r(); ctx.fillStyle = t < 0.33 ? css(base) : t < 0.66 ? css(accent, 1, 0.9) : css(base, 0.55); ctx.fillRect(x, y, s, s); } break; }
    default: {
      // Liso: grano sutil y pliegues.
      for (let i = 0; i < w * h / 60; i++) { ctx.fillStyle = css(base, 0.85 + r() * 0.3, 0.25); ctx.fillRect(r() * w, r() * h, 1, 1); }
      ctx.strokeStyle = css(base, 0.7, 0.35); ctx.lineWidth = Math.max(1, u * 0.12);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); const x = w * (0.2 + r() * 0.6); ctx.moveTo(x, h * 0.1); ctx.quadraticCurveTo(x + u * (r() - 0.5) * 2, h * 0.5, x + u * (r() - 0.5), h * 0.95); ctx.stroke(); }
    }
  }
}

/** Tejido de una prenda con volumen, del tamaño de la pieza (en unidades del personaje). */
export function fabricTexture(pattern: string, base: string, accent: string, wu: number, hu: number) {
  return make(`f|${pattern}|${base}|${accent}|${wu.toFixed(1)}x${hu.toFixed(1)}`, wu, hu, (ctx, w, h, r) => { drawFabric(ctx, w, h, r, pattern || 'liso', base, accent); volume(ctx, w, h); });
}

// ------------------------------------------------------------------ tatuajes
function ink(ctx: CanvasRenderingContext2D, col: string, a = 0.92) { ctx.fillStyle = css(col, 1, a); ctx.strokeStyle = css(col, 1, a); }
function drawTattoo(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, style: string, inkCol: string, accent: string) {
  const u = PX;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ink(ctx, inkCol);
  const cx = w / 2;
  switch (style) {
    case 'tribal': {
      ctx.lineWidth = u * 0.5;
      for (let y = u; y < h - u; y += u * 3) {
        ctx.beginPath(); ctx.moveTo(w * 0.1, y); ctx.bezierCurveTo(w * 0.9, y - u, w * 0.2, y + u * 1.6, w * 0.85, y + u * 2.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w * 0.85, y + u * 2.4); ctx.lineTo(w * 0.98, y + u * 2.9); ctx.lineTo(w * 0.7, y + u * 2.6); ctx.fill();
      }
      break;
    }
    case 'circuito': {
      ctx.lineWidth = Math.max(1, u * 0.18); ink(ctx, accent);
      for (let i = 0; i < 6; i++) { let x = w * (0.15 + r() * 0.7), y = h * r(); ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { if (k % 2) x = Math.max(2, Math.min(w - 2, x + (r() - 0.5) * w)); else y += u * (1 + r() * 2); ctx.lineTo(x, y); } ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, u * 0.28, 0, 7); ctx.fill(); }
      break;
    }
    case 'floral': case 'rosa': {
      for (let i = 0; i < (style === 'rosa' ? 2 : 4); i++) {
        const x = w * (0.3 + r() * 0.4), y = h * (0.15 + i * (style === 'rosa' ? 0.4 : 0.22));
        ink(ctx, style === 'rosa' ? '#d0102a' : ['#ff6aa8', '#ffb020', '#b46cff', '#ff4060'][i % 4]);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * u * 0.6, y + Math.sin(a) * u * 0.6, u * 0.55, u * 0.35, a, 0, 7); ctx.fill(); }
        ink(ctx, '#ffe080'); ctx.beginPath(); ctx.arc(x, y, u * 0.3, 0, 7); ctx.fill();
        ink(ctx, '#2a8a3a'); ctx.lineWidth = u * 0.18; ctx.beginPath(); ctx.moveTo(x, y + u * 0.8); ctx.quadraticCurveTo(x + u, y + u * 2, x - u * 0.2, y + u * 3); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x + u * 0.6, y + u * 1.8, u * 0.5, u * 0.22, 0.6, 0, 7); ctx.fill();
        if (style === 'rosa') { ink(ctx, inkCol); for (let t = 0; t < 3; t++) { ctx.beginPath(); ctx.moveTo(x + u * 0.2, y + u * (1.2 + t * 0.6)); ctx.lineTo(x + u * 0.6, y + u * (1.1 + t * 0.6)); ctx.stroke(); } }
      }
      break;
    }
    case 'codigo': { ctx.font = `bold ${u * 0.9}px monospace`; ink(ctx, '#5affc8'); for (let y = u; y < h; y += u * 1.1) ctx.fillText(Array.from({ length: Math.max(1, Math.floor(w / (u * 0.6))) }, () => (r() < 0.5 ? '0' : '1')).join(''), 1, y); break; }
    case 'dragon': case 'serpiente': {
      // Cuerpo sinuoso que recorre el miembro, con escamas y cabeza arriba (diseño original).
      ctx.lineWidth = u * (style === 'dragon' ? 1.1 : 0.8);
      ctx.beginPath(); ctx.moveTo(cx, h); for (let y = h; y > u * 2; y -= u) ctx.lineTo(cx + Math.sin(y / (u * 2.2)) * w * 0.32, y); ctx.stroke();
      ink(ctx, style === 'dragon' ? '#2a9a5a' : '#6a8a2a', 0.9); ctx.lineWidth = u * 0.5;
      ctx.beginPath(); ctx.moveTo(cx, h); for (let y = h; y > u * 2; y -= u) ctx.lineTo(cx + Math.sin(y / (u * 2.2)) * w * 0.32, y); ctx.stroke();
      ink(ctx, inkCol);
      for (let y = h - u; y > u * 3; y -= u * 0.8) { const x = cx + Math.sin(y / (u * 2.2)) * w * 0.32; ctx.beginPath(); ctx.arc(x, y, u * 0.15, 0, 7); ctx.fill(); }
      const hx = cx + Math.sin((u * 2) / (u * 2.2)) * w * 0.32;
      ctx.beginPath(); ctx.ellipse(hx, u * 1.8, u * 0.9, u * 0.6, -0.4, 0, 7); ctx.fill();
      ink(ctx, '#ffd23f'); ctx.beginPath(); ctx.arc(hx + u * 0.3, u * 1.6, u * 0.18, 0, 7); ctx.fill();
      if (style === 'dragon') { ink(ctx, inkCol); ctx.lineWidth = u * 0.15; ctx.beginPath(); ctx.moveTo(hx - u * 0.5, u * 1.4); ctx.lineTo(hx - u * 1.2, u * 0.5); ctx.moveTo(hx, u * 1.3); ctx.lineTo(hx - u * 0.3, u * 0.3); ctx.stroke(); }
      break;
    }
    case 'calavera': {
      const y = h * 0.35, s = Math.min(w * 0.4, u * 1.6);
      ink(ctx, '#f0ece0'); ctx.beginPath(); ctx.arc(cx, y, s, Math.PI, 0); ctx.lineTo(cx + s * 0.7, y + s * 0.9); ctx.lineTo(cx - s * 0.7, y + s * 0.9); ctx.closePath(); ctx.fill();
      ink(ctx, inkCol); ctx.lineWidth = Math.max(1, u * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - s * 0.4, y + s * 0.1, s * 0.25, 0, 7); ctx.arc(cx + s * 0.4, y + s * 0.1, s * 0.25, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, y + s * 0.35); ctx.lineTo(cx - s * 0.12, y + s * 0.55); ctx.lineTo(cx + s * 0.12, y + s * 0.55); ctx.fill();
      for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * s * 0.22 - 1, y + s * 0.7, Math.max(1, u * 0.1), s * 0.2);
      ctx.lineWidth = u * 0.25; ctx.beginPath(); ctx.moveTo(cx - s, y + s * 1.6); ctx.lineTo(cx + s, y + s * 2.6); ctx.moveTo(cx + s, y + s * 1.6); ctx.lineTo(cx - s, y + s * 2.6); ctx.stroke();
      break;
    }
    case 'geometrico': { ctx.lineWidth = Math.max(1, u * 0.14); for (let y = u; y < h; y += u * 2.4) { ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + w * 0.35, y + u * 1.2); ctx.lineTo(cx, y + u * 2.4); ctx.lineTo(cx - w * 0.35, y + u * 1.2); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, y + u * 1.2, u * 0.3, 0, 7); ctx.fill(); } break; }
    case 'mandala': {
      const y = h * 0.4, R = Math.min(w * 0.45, u * 2);
      ctx.lineWidth = Math.max(1, u * 0.1);
      for (let ring = 1; ring <= 3; ring++) { ctx.beginPath(); ctx.arc(cx, y, (R * ring) / 3, 0, 7); ctx.stroke(); for (let k = 0; k < 8 * ring; k++) { const a = (k / (8 * ring)) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * (R * ring) / 3, y + Math.sin(a) * (R * ring) / 3, u * 0.25, u * 0.12, a, 0, 7); ctx.fill(); } }
      for (let yy = y + R + u; yy < h; yy += u * 0.7) { ctx.beginPath(); ctx.arc(cx, yy, u * 0.12, 0, 7); ctx.fill(); }
      break;
    }
    case 'olas': { ctx.lineWidth = u * 0.3; ink(ctx, '#2a6ab8'); for (let y = u; y < h; y += u * 1.6) { ctx.beginPath(); for (let x = 0; x <= w; x += 2) ctx.lineTo(x, y + Math.sin(x / (u * 0.7)) * u * 0.5); ctx.stroke(); } ink(ctx, '#e8f4ff'); for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(r() * w, r() * h, u * 0.15, 0, 7); ctx.fill(); } break; }
    case 'llamas': {
      for (let i = 0; i < 4; i++) { const x = w * (0.15 + i * 0.23); const top = h * (0.15 + r() * 0.3); const g = ctx.createLinearGradient(0, h, 0, top); g.addColorStop(0, '#d01010'); g.addColorStop(0.5, '#ff7a10'); g.addColorStop(1, '#ffe040'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - u * 0.6, h); ctx.quadraticCurveTo(x - u, h * 0.6, x, top); ctx.quadraticCurveTo(x + u * 0.4, h * 0.6, x + u * 0.6, h); ctx.fill(); }
      break;
    }
    case 'telarana': { ctx.lineWidth = Math.max(1, u * 0.08); const y = h * 0.3; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + Math.cos(a) * w, y + Math.sin(a) * w); ctx.stroke(); } for (let rr = u * 0.6; rr < w; rr += u * 0.6) { ctx.beginPath(); for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2; ctx.lineTo(cx + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.stroke(); } ctx.beginPath(); ctx.arc(cx + u * 0.4, y + u * 1.6, u * 0.35, 0, 7); ctx.fill(); break; }
    case 'alas': { ctx.lineWidth = Math.max(1, u * 0.12); for (let i = 0; i < 7; i++) { const y = u + i * u * 0.9; ctx.beginPath(); ctx.ellipse(cx, y + u, w * (0.45 - i * 0.04), u * 0.45, -0.2, 0, Math.PI); ctx.stroke(); for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(cx - w * 0.3 + k * w * 0.3, y + u * 1.2); ctx.lineTo(cx - w * 0.25 + k * w * 0.3, y + u * 1.6); ctx.stroke(); } } break; }
    case 'koi': {
      for (const [y, col] of [[h * 0.3, '#ff6a20'], [h * 0.7, '#f0f0f0']] as [number, string][]) {
        ink(ctx, col); ctx.beginPath(); ctx.ellipse(cx, y, w * 0.3, u * 1.1, 0.5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - w * 0.25, y + u); ctx.lineTo(cx - w * 0.45, y + u * 2); ctx.lineTo(cx - w * 0.1, y + u * 1.5); ctx.fill();
        ink(ctx, inkCol); ctx.lineWidth = Math.max(1, u * 0.08); ctx.beginPath(); ctx.ellipse(cx, y, w * 0.3, u * 1.1, 0.5, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + w * 0.15, y - u * 0.4, u * 0.15, 0, 7); ctx.fill();
      }
      ink(ctx, '#2a6ab8', 0.5); ctx.lineWidth = u * 0.12; for (let y = u; y < h; y += u * 2) { ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(cx, y - u, w, y); ctx.stroke(); }
      break;
    }
    case 'estrellas': { for (let i = 0; i < 7; i++) { const x = w * (0.2 + r() * 0.6), y = h * (0.08 + i * 0.13), s = u * (0.4 + r() * 0.5); ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2; const rr = k % 2 ? s * 0.45 : s; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); } break; }
    case 'barras': { for (let x = u * 0.4; x < w - u * 0.4; x += u * (0.2 + r() * 0.35)) ctx.fillRect(x, h * 0.25, Math.max(1, u * (0.08 + r() * 0.18)), u * 2.2); ctx.font = `${u * 0.55}px monospace`; ctx.fillText('0451-9X', u * 0.3, h * 0.25 + u * 3); break; }
    case 'glitch': { for (let i = 0; i < 18; i++) { ctx.fillStyle = ['rgba(255,40,80,0.8)', 'rgba(67,243,255,0.8)', css(inkCol)][i % 3]; ctx.fillRect(r() * w * 0.6, r() * h, w * (0.2 + r() * 0.6), u * (0.15 + r() * 0.4)); } break; }
    case 'runas': { ctx.lineWidth = Math.max(1, u * 0.16); for (let y = u; y < h - u; y += u * 1.8) { const x = cx - u * 0.5; ctx.beginPath(); const n = 2 + Math.floor(r() * 3); ctx.moveTo(x, y); for (let k = 0; k < n; k++) ctx.lineTo(x + (r() > 0.5 ? u : 0), y + (k + 1) * (u * 1.2 / n)); ctx.moveTo(x + u * 0.5, y); ctx.lineTo(x + u * 0.5, y + u * 1.2); ctx.stroke(); } break; }
    case 'biomecanico': {
      ink(ctx, '#3a3a44'); ctx.lineWidth = u * 0.5;
      for (let i = 0; i < 3; i++) { const x = w * (0.25 + i * 0.25); ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + u, h * 0.3, x - u, h * 0.6, x, h); ctx.stroke(); }
      ink(ctx, '#8a8a9a', 0.9); for (let y = u; y < h; y += u * 1.4) { ctx.beginPath(); ctx.ellipse(cx, y, w * 0.38, u * 0.25, 0, 0, 7); ctx.fill(); }
      ink(ctx, '#7a0a10', 0.7); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(w * r(), h * r(), u * 0.5, u * 0.9, 0, 0, 7); ctx.fill(); }
      break;
    }
    case 'puntillismo': { for (let i = 0; i < w * h / (u * 1.4); i++) { const y = r() * h; if (r() > y / h + 0.2) continue; ctx.beginPath(); ctx.arc(r() * w, y, Math.max(0.6, u * 0.08), 0, 7); ctx.fill(); } break; }
    case 'acuarela': { for (let i = 0; i < 6; i++) { ctx.fillStyle = ['rgba(255,80,160,0.35)', 'rgba(80,180,255,0.35)', 'rgba(255,200,60,0.35)', 'rgba(120,255,160,0.3)'][i % 4]; ctx.beginPath(); ctx.ellipse(w * r(), h * r(), u * (0.8 + r()), u * (1 + r() * 1.5), r() * 3, 0, 7); ctx.fill(); } ink(ctx, inkCol); ctx.lineWidth = Math.max(1, u * 0.1); ctx.beginPath(); ctx.moveTo(cx - u, h * 0.2); ctx.quadraticCurveTo(cx + u, h * 0.4, cx - u * 0.5, h * 0.8); ctx.stroke(); break; }
  }
}

/** Piel con un tatuaje (o sin él), con volumen, para un brazo, pierna, torso o cuello. */
export function skinTexture(skin: string, style: string, inkCol: string, accent: string, wu: number, hu: number, part: string) {
  return make(`s|${skin}|${style}|${inkCol}|${accent}|${wu.toFixed(1)}x${hu.toFixed(1)}|${part}`, wu, hu, (ctx, w, h, r) => {
    ctx.fillStyle = css(skin); ctx.fillRect(0, 0, w, h);
    // Poros y tono irregular de la piel.
    for (let i = 0; i < w * h / 90; i++) { ctx.fillStyle = css(skin, 0.9 + r() * 0.2, 0.25); ctx.fillRect(r() * w, r() * h, 1, 1); }
    if (style && style !== 'ninguno') drawTattoo(ctx, w, h, r, style, inkCol || '#14141e', accent);
    volume(ctx, w, h, 0.3, 0.1);
  });
}

/** v0.11 · Versiones en lienzo (para los modelos 3D). */
export function fabricCanvas(pattern: string, base: string, accent: string, wu: number, hu: number) {
  return makeCanvas(`f|${pattern}|${base}|${accent}|${wu.toFixed(1)}x${hu.toFixed(1)}`, wu, hu, (ctx, w, h, r) => { drawFabric(ctx, w, h, r, pattern || 'liso', base, accent); volume(ctx, w, h, 0.18, 0.06); });
}
export function skinCanvas(skin: string, style: string, inkCol: string, accent: string, wu: number, hu: number, part: string) {
  return makeCanvas(`s|${skin}|${style}|${inkCol}|${accent}|${wu.toFixed(1)}x${hu.toFixed(1)}|${part}|3d`, wu, hu, (ctx, w, h, r) => {
    ctx.fillStyle = css(skin); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 90; i++) { ctx.fillStyle = css(skin, 0.92 + r() * 0.16, 0.2); ctx.fillRect(r() * w, r() * h, 1, 1); }
    if (style && style !== 'ninguno') drawTattoo(ctx, w, h, r, style, inkCol || '#14141e', accent);
  });
}
/** v0.16 · Solo el tatuaje, sobre fondo transparente (el cuerpo del kit lo proyecta sobre su piel). */
export function tattooCanvas(style: string, inkCol: string, accent: string) {
  return makeCanvas(`t|${style}|${inkCol}|${accent}|3d`, 16, 16, (ctx, w, h, r) => { ctx.clearRect(0, 0, w, h); drawTattoo(ctx, w, h, r, style, inkCol || '#14141e', accent); });
}
