// v0.44 · Estadísticas de las armas (barras blancas del 1 al 10) y banco de armero: elegir arma, ver sus huecos, poner y
// quitar accesorios y ver antes de montarlo cómo cambia cada barra (verde si mejora, roja si empeora).
import { ATTACH_SLOTS, CLASS_NAMES, SLOT_NAMES, STAT_NAMES, moddedValues, weaponClass, weaponStats, type AttachSlot, type CharacterSheet, type ItemDef, type ShopView, type WeaponStats } from '@vertice/shared';
import { content } from '../content';
import { newOpId, type Net } from '../net';
import { fmtMoney, h } from './dom';
import { showPanel } from './life';
import { blip } from '../audio';

const item = (id: string) => content.items.find((i) => i.id === id);
const STAT_KEYS = Object.keys(STAT_NAMES) as (keyof WeaponStats)[];
/** Barras blancas de 1 a 10 (con lo que cambiaría un accesorio, si se pasa `after`). Ruido: menos es mejor. */
export function statBars(stats: WeaponStats, after?: WeaponStats) {
  return h('div', { class: 'wstats' }, ...STAT_KEYS.map((k) => {
    const v = stats[k], a = after?.[k], d = a !== undefined ? +(a - v).toFixed(1) : 0;
    const better = k === 'ruido' ? d < 0 : d > 0;
    return h('div', { class: 'wstat' },
      h('span', { class: 'wstat-n' }, STAT_NAMES[k]),
      h('div', { class: 'wstat-bar' }, h('i', { style: { width: `${(Math.min(v, a ?? v) / 10) * 100}%` } }),
        d ? h('b', { class: better ? 'up' : 'down', style: { left: `${(Math.min(v, a!) / 10) * 100}%`, width: `${(Math.abs(d) / 10) * 100}%` } }) : null),
      h('span', { class: `wstat-v mono ${d ? (better ? 'netok' : 'netbad') : ''}` }, d ? `${(a!).toFixed(1)} (${d > 0 ? '+' : ''}${d})` : v.toFixed(1)));
  }));
}
/** Barras de un arma con unos accesorios (ids) puestos. */
export function statsOf(weapon: ItemDef, attIds: string[]) {
  return weaponStats(moddedValues(weapon as any, attIds.map((id) => item(id)?.attachment as any).filter(Boolean)));
}
/** Qué hace un accesorio, en palabras. */
export function attachmentSummary(def: ItemDef) {
  const a = def.attachment!; const m = a.mods; const out: string[] = [];
  if (a.sight) out.push(`Aumento ×${String(a.sight.zoom).replace('.', ',')}`);
  if (m.dmg) out.push(`${m.dmg > 0 ? '+' : ''}${Math.round(m.dmg * 100)} % daño`);
  if (m.range) out.push(`${m.range > 0 ? '+' : ''}${m.range} m de alcance`);
  if (m.acc) out.push(`${m.acc > 0 ? '+' : ''}${m.acc} precisión`);
  if (m.rate) out.push(`${m.rate < 0 ? 'más' : 'menos'} cadencia (${Math.round(Math.abs(m.rate) * 100)} %)`);
  if (m.noise) out.push(`${m.noise < 0 ? '−' : '+'}${Math.round(Math.abs(m.noise) * 100)} % ruido`);
  if (m.weight) out.push(`${m.weight > 0 ? '+' : ''}${m.weight} kg`);
  return `${SLOT_NAMES[a.slot as AttachSlot]} · ${(a.classes as string[]).map((c) => CLASS_NAMES[c as keyof typeof CLASS_NAMES]).join(', ')} · ${out.join(' · ')}${a.legal === false ? ' · ILEGAL' : ''}`;
}

/** Banco de armero (desde una armería con taller). */
type ArmeroCtx = { net: Net; sheet?: () => CharacterSheet | null; back?: (v: ShopView) => void };
let last: { ctx: ArmeroCtx; shop: ShopView; pick?: string } | null = null;
/** Si el banco está abierto, lo repinta (con la tienda nueva si llega) y devuelve true. */
export function armeroRefresh(shop?: ShopView) {
  if (!last || !document.getElementById('armero-panel')) return false;
  if (shop && shop.shop !== last.shop.shop) return false;
  armeroPanel(last.ctx, shop ?? last.shop, last.pick); return true;
}
export function armeroPanel(ctx: ArmeroCtx, shop: ShopView, pick?: string) {
  const s = ctx.sheet?.(); if (!s) return;
  last = { ctx, shop, pick };
  const back = ctx.back ? h('button', { class: 'btn small', onclick: () => { last = null; ctx.back!(shop); } }, '← Volver a la tienda') : null;
  const owned = (id: string) => s.inventory.find((i) => i.def === id)?.qty ?? 0;
  const guns = s.inventory.map((i) => item(i.def)).filter((d): d is ItemDef => !!d && !!weaponClass(d) && owned(d.id) > 0);
  if (!guns.length) { showPanel('armero-panel', `Banco de armero · ${shop.name}`, back, h('p', { class: 'muted' }, 'No llevas ningún arma de fuego que admita accesorios. Compra una aquí mismo.')); return; }
  const gun = guns.find((g) => g.id === pick) ?? guns[0]; last.pick = gun.id;
  const cls = weaponClass(gun)!;
  const mods = s.weaponMods?.[gun.id] ?? {};
  const now = Object.values(mods) as string[];
  const base = statsOf(gun, now);
  let preview: WeaponStats | undefined;
  const bars = h('div', {}, statBars(base));
  const show = (after?: WeaponStats) => { preview = after; bars.replaceChildren(statBars(base, preview)); };
  const swap = (attId: string) => { const a = item(attId)!; const next = { ...mods, [a.attachment!.slot]: attId } as Record<string, string>; return statsOf(gun, Object.values(next)); };
  const compatible = content.items.filter((d) => d.attachment && (d.attachment.classes as string[]).includes(cls));
  const forSale = new Map(shop.items.map((i) => [i.item, i]));
  const slotRow = (slot: AttachSlot) => {
    const cur = mods[slot], curDef = cur ? item(cur) : undefined;
    const options = compatible.filter((d) => d.attachment!.slot === slot);
    if (!options.length) return null;
    return h('div', { class: 'armero-slot' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, SLOT_NAMES[slot]),
        curDef ? h('span', {}, h('span', { class: 'cy' }, curDef.name), ' ', h('button', { class: 'btn small', onclick: () => { ctx.net.send({ t: 'weaponMod', seq: 0, action: 'remove', weapon: gun.id, slot, opId: newOpId() } as any); blip('step'); } }, 'Quitar')) : h('span', { class: 'muted small' }, 'Vacío')),
      h('div', { class: 'armero-opts' }, ...options.map((d) => {
        const have = owned(d.id), sale = forSale.get(d.id), on = cur === d.id;
        return h('div', { class: `armero-opt${on ? ' on' : ''}`, onmouseenter: () => show(on ? undefined : swap(d.id)), onmouseleave: () => show(undefined) },
          h('div', {}, h('b', {}, d.name), d.attachment!.legal === false ? h('span', { class: 'chip bad', style: { marginLeft: '6px' } }, 'ilegal') : null),
          h('div', { class: 'small muted' }, attachmentSummary(d).split(' · ').slice(2).join(' · ')),
          h('div', { class: 'row', style: { gap: '6px', marginTop: '4px' } },
            on ? h('span', { class: 'small netok' }, 'Montado')
              : have ? h('button', { class: 'btn small primary', onclick: () => { ctx.net.send({ t: 'weaponMod', seq: 0, action: 'install', weapon: gun.id, attachment: d.id, opId: newOpId() } as any); blip('good'); } }, `Montar (tienes ${have})`)
              : sale ? h('button', { class: 'btn small', disabled: sale.price > shop.money || sale.stock < 1, onclick: () => { ctx.net.send({ t: 'buy', shop: shop.shop, item: d.id, qty: 1, opId: newOpId() } as any); blip(); } }, `Comprar ${fmtMoney(sale.price)}`)
              : h('span', { class: 'small muted' }, 'No lo venden aquí')));
      })));
  };
  showPanel('armero-panel', `Banco de armero · ${shop.name}`, back,
    h('p', { class: 'muted small' }, 'Elige un arma, pasa el ratón por un accesorio para ver cómo cambian sus barras y móntalo. Cada accesorio solo encaja en ciertos tipos de arma; los ilegales solo los venden en el mercado negro. Al montar uno, el que ocupaba ese hueco vuelve a tu inventario.'),
    h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, ...guns.map((g) => h('button', { class: `btn small${g.id === gun.id ? ' primary' : ''}`, onclick: () => armeroPanel(ctx, shop, g.id) }, g.name))),
    h('div', { class: 'armero-head' }, h('div', {}, h('h3', { style: { margin: '6px 0 2px' } }, gun.name), h('div', { class: 'small muted' }, `${CLASS_NAMES[cls]} · ${now.length} accesorio${now.length === 1 ? '' : 's'}`)), bars),
    h('div', { class: 'armero-slots' }, ...ATTACH_SLOTS.map(slotRow).filter(Boolean)));
}
