import type { ClinicOffer, CyberSide, CyberwareDef, ItemDef } from '@vertice/shared';
import { CYBER_SIDES, pairedSlot } from '@vertice/shared';
import { content } from '../content';
import { Preview3D } from '../render/chars3d';
import { $ui, h } from './dom';
import { flatFittingAppearance, garmentFits, originalLook, tryGarment, tryImplant, type FittingLook, type FittingSheet } from './fitting-model';
import { Preview } from './preview';
import './fitting-room.css';

let closeRoom: (() => void) | undefined;
export const fittingRoomOpen = () => !!closeRoom;
export function closeFittingRoom() {
  if (!closeRoom) return false;
  closeRoom();
  return true;
}

interface RoomItem {
  name: string;
  category: 'Ropa' | 'Ciberware';
  sides?: readonly CyberSide[];
  notice?: string;
  look: (side: CyberSide) => FittingLook;
}

function fittingRoom(sheet: FittingSheet, item: RoomItem) {
  closeFittingRoom();
  const focusBefore = document.activeElement;
  const room = h('dialog', { class: 'fitting-room', 'aria-labelledby': 'fitting-title' });
  let preview: Preview3D | Preview, flat = false;
  const width = Math.min(360, Math.max(230, window.innerWidth - 66));
  const height = Math.min(448, Math.round(window.innerHeight * .55));
  try { preview = new Preview3D(width, height, 'fitting-scene'); }
  catch { preview = new Preview(width, height, 'fitting-scene'); flat = true; }
  let matching = true;
  const side = h('select', { 'aria-label': 'Lado del implante', onchange: () => render() },
    ...(item.sides ?? []).map(value => h('option', { value }, value === 'izq' ? 'Izquierdo' : 'Derecho')));
  const base = h('button', { class: 'segbtn', onclick: () => { matching = false; render(); } }, 'Aspecto actual');
  const target = h('button', { class: 'segbtn', onclick: () => { matching = true; render(); } }, 'Con el cambio');
  const comparing = h('p', { class: 'fitting-caption', role: 'status' });
  const exit = () => {
    if (closeRoom !== exit) return;
    closeRoom = undefined;
    preview.destroy();
    room.close();
    room.remove();
    if (focusBefore instanceof HTMLElement && focusBefore.isConnected) focusBefore.focus();
  };
  function render() {
    const look = matching ? item.look((side.value as CyberSide) || 'der') : originalLook(sheet);
    base.setAttribute('aria-pressed', String(!matching));
    target.setAttribute('aria-pressed', String(matching));
    side.disabled = !matching;
    comparing.textContent = (matching ? item.name : 'Aspecto actual') + (flat ? ' · Vista 2D simplificada' : '');
    void preview.show(flat ? flatFittingAppearance(look.appearance, content.items) : look.appearance, look.chrome, undefined, look.lost, sheet.name);
  }
  closeRoom = exit;
  room.addEventListener('cancel', e => { e.preventDefault(); exit(); });
  room.addEventListener('close', exit);
  room.addEventListener('click', e => { if (e.target === room) exit(); });
  room.append(h('div', { class: 'fitting-layout' },
    h('header', { class: 'fitting-head' }, h('div', {}, h('p', {}, 'Probador · ', item.category), h('h2', { id: 'fitting-title' }, item.name)),
      h('button', { class: 'btn small', autofocus: true, onclick: exit }, 'Volver al catálogo')),
    h('div', { class: 'fitting-view' }, preview.el),
    h('div', { class: 'fitting-control' },
      h('div', { class: 'seg wrap', role: 'group', 'aria-label': 'Comparar aspecto' }, base, target),
      item.sides?.length ? h('label', { class: 'row' }, 'Lado', side) : null,
      comparing,
      item.notice ? h('p', { class: 'muted' }, item.notice) : null)));
  $ui().append(room);
  room.showModal();
  render();
}

export function tryClothingRoom(sheet: FittingSheet, d: ItemDef) {
  if (!garmentFits(sheet, d)) return;
  fittingRoom(sheet, { name: d.name, category: 'Ropa', look: () => tryGarment(content, sheet, d) });
}
export function tryCyberRoom(sheet: FittingSheet, d: CyberwareDef, offer?: ClinicOffer) {
  const removal = offer?.action === 'remove';
  fittingRoom(sheet, {
    name: removal ? `Retirar ${d.name}` : d.name,
    category: 'Ciberware',
    sides: !removal && pairedSlot[d.slot] ? (offer?.sides?.length ? offer.sides : CYBER_SIDES) : undefined,
    notice: d.visible === 'ninguna' ? 'Este implante es interno.' : offer?.blocked,
    look: side => tryImplant(content, sheet, d, side, removal ? offer.ref : undefined),
  });
}
