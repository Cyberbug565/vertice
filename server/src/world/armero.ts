// v0.44 · Banco de armero: en las armerías con taller se ponen y se quitan accesorios. Poner uno lo saca del inventario
// (y devuelve el que ocupaba ese hueco); quitarlo lo devuelve. Se guarda en los flags del personaje.
import { ATTACH_SLOTS, SLOT_NAMES, weaponClass, type AttachSlot } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { buildSheet, type PlayerState } from '../game/player.js';
import { MODS_FLAG, fits, modsOf, type WeaponMods } from '../game/weapons.js';
import type { PlayerConn, World } from './world.js';

export class Armero {
  constructor(private readonly w: World) {}

  /** Banco de armero al alcance (mostrador de una armería con taller, a 4 casillas). */
  bench(c: PlayerConn) {
    const e = c.e; if (!e) return null;
    for (const o of e.zone.query(e.x, e.y, 4)) {
      if (o.objKind !== 'shop' || !o.shop) continue;
      const sh = this.w.c.shops.find((s) => s.id === o.shop);
      if (sh?.taller) return sh;
    }
    return null;
  }

  private async save(p: PlayerState, mods: WeaponMods) {
    p.flags.set(MODS_FLAG, { value: mods, expiresAt: null });
    await this.w.db.query('INSERT INTO character_flags (character_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (character_id, key) DO UPDATE SET value = EXCLUDED.value', [p.charId, MODS_FLAG, JSON.stringify(mods)]);
  }

  async command(c: PlayerConn, m: { action: 'install' | 'remove'; weapon: string; attachment?: string; slot?: AttachSlot; opId: string }) {
    const p = c.p!;
    const bench = this.bench(c);
    if (!bench) throw new GameError('Los accesorios se montan en el banco de una armería con taller.');
    const weapon = this.w.c.items.find((i) => i.id === m.weapon);
    if (!weapon || !weaponClass(weapon)) throw new GameError('Esa arma no admite accesorios.');
    if ((p.inventory.get(weapon.id) ?? 0) < 1) throw new GameError('No llevas esa arma.');
    const mods = structuredClone(modsOf(p));
    const slots = (mods[weapon.id] ??= {});
    if (m.action === 'install') {
      const att = this.w.c.items.find((i) => i.id === m.attachment);
      if (!att?.attachment) throw new GameError('Eso no es un accesorio.');
      if (!fits(this.w.c, weapon, att)) throw new GameError(`${att.name} no encaja en ${weapon.name}.`);
      if ((p.inventory.get(att.id) ?? 0) < 1) throw new GameError(`No tienes ${att.name}: cómpralo primero.`);
      const slot = att.attachment.slot as AttachSlot, old = slots[slot];
      const effects: { item: string; qty: number }[] = [{ item: att.id, qty: -1 }];
      if (old) effects.push({ item: old, qty: 1 });
      await this.w.effects.apply(p, effects, { opId: m.opId, kind: 'armero' } as any);
      slots[slot] = att.id;
      await this.save(p, mods);
      this.w.send(c, { t: 'notice', kind: 'good', text: `${bench.name}: ${att.name} montado en ${weapon.name}${old ? ` (te devuelven ${this.w.c.items.find((i) => i.id === old)?.name})` : ''}.` });
    } else {
      const slot = m.slot && (ATTACH_SLOTS as readonly string[]).includes(m.slot) ? m.slot : undefined;
      const old = slot ? slots[slot] : undefined;
      if (!slot || !old) throw new GameError('Ese hueco está vacío.');
      await this.w.effects.apply(p, [{ item: old, qty: 1 }], { opId: m.opId, kind: 'armero' } as any);
      delete slots[slot];
      if (!Object.keys(slots).length) delete mods[weapon.id];
      await this.save(p, mods);
      this.w.send(c, { t: 'notice', kind: 'info', text: `Desmontas ${this.w.c.items.find((i) => i.id === old)?.name} (${SLOT_NAMES[slot].toLowerCase()}) de ${weapon.name}.` });
    }
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
}
