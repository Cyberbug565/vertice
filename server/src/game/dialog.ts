// Evaluación de condiciones y construcción de vistas de diálogo (sin efectos secundarios).
import { checkChance, t, RULES, type Condition, type Content, type DialogDef, type DialogOption, type DialogView } from '@vertice/shared';
import { flagValue, type PlayerState } from './player.js';
import type { FactService } from './services.js';

export function evalCondition(c: Content, p: PlayerState, facts: FactService, cond: Condition): boolean {
  if ('role' in cond) return p.role === cond.role;
  if ('notRole' in cond) return p.role !== cond.notRole;
  if ('origin' in cond) return p.origin === cond.origin;
  if ('contract' in cond) return (p.contracts.get(cond.contract)?.state ?? 'none') === cond.state;
  if ('objective' in cond) {
    const cp = [...p.contracts.values()].find((x) => x.state === 'active' && c.contracts.find((k) => k.id === x.contractId)?.objectives.some((o) => o.id === cond.objective));
    return !!cp?.objectives[cond.objective] === cond.done;
  }
  if ('flag' in cond) return flagValue(p, cond.flag) === cond.is;
  if ('hasItem' in cond) return (p.inventory.get(cond.hasItem) ?? 0) > 0;
  if ('money' in cond) return p.money >= cond.money;
  if ('fact' in cond) return facts.get(cond.fact) === cond.is;
  return false;
}
export const allOk = (c: Content, p: PlayerState, f: FactService, conds: Condition[]) => conds.every((x) => evalCondition(c, p, f, x));

export function entryNode(c: Content, p: PlayerState, f: FactService, d: DialogDef): string {
  return d.entries.find((e) => allOk(c, p, f, e.if))!.node;
}

export function checkNumbers(c: Content, p: PlayerState, o: DialogOption) {
  const ch = o.check!;
  const bonus = ch.roleBonus && ch.roleBonus.role === p.role ? ch.roleBonus.bonus + (p.roleRank - 1) : 0;
  return { attrValue: p.attributes[ch.attr], skillValue: p.skills[ch.skill] ?? 0, bonus, dv: ch.dv, skillName: c.skills.find((s) => s.id === ch.skill)?.name ?? ch.skill };
}

export function buildView(c: Content, p: PlayerState, f: FactService, d: DialogDef, nodeId: string, dialogNo: number, speaker: { name: string; title?: string }): DialogView {
  const node = d.nodes[nodeId];
  return {
    dialog: dialogNo, speaker: speaker.name, title: speaker.title, text: t(c, node.text),
    options: node.options.filter((o) => allOk(c, p, f, o.if)).map((o) => {
      const disabled = o.require.length && !allOk(c, p, f, o.require) ? t(c, o.requireText!) : undefined;
      let check;
      if (o.check) {
        const n = checkNumbers(c, p, o);
        check = {
          label: `${o.check.attr} ${n.attrValue} + ${n.skillName} ${n.skillValue}${n.bonus ? ` + rol ${n.bonus}` : ''} + 1d10 ≥ ${n.dv}`,
          attr: o.check.attr, attrValue: n.attrValue, skill: n.skillName, skillValue: n.skillValue, bonus: n.bonus, dv: n.dv,
          chance: checkChance(n.attrValue, n.skillValue, n.dv, 0, n.bonus),
          luckAvailable: p.luck, maxLuck: Math.min(p.luck, RULES.luckMaxSpendPerCheck),
          failText: o.failText ? t(c, o.failText) : 'Fallar tiene consecuencias.', previous: p.checks.has(o.check.key),
        };
      }
      return { id: o.id, text: t(c, o.text), disabled, check };
    }),
  };
}
