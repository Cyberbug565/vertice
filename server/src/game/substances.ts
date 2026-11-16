import type { Content, ItemDef, SubstanceView } from '@vertice/shared';

interface Habit { value: number; at: number }
interface AlcoholUse {
  load: number; at: number; habit: Habit; sickUntil: number; hangoverUntil: number;
}
interface DrugUse { habit: Habit; activeUntil: number; crashUntil: number }
export interface SubstanceUse { alcohol?: AlcoholUse; drugs?: Record<string, DrugUse> }

const ADDICTION = 56;
const DRINK_DECAY_MS = 6_000;
const HABIT_DECAY_MS = 120_000;
const remaining = (value: number, at: number, now: number, msPerPoint: number) =>
  Math.max(0, value - Math.max(0, now - at) / msPerPoint);

export const intoxication = (state: SubstanceUse, now = Date.now()) =>
  state.alcohol ? remaining(state.alcohol.load, state.alcohol.at, now, DRINK_DECAY_MS) : 0;
export const isSick = (state: SubstanceUse, now = Date.now()) => (state.alcohol?.sickUntil ?? 0) > now;

function dependence(habit: Habit | undefined, now: number) {
  return habit ? remaining(habit.value, habit.at, now, HABIT_DECAY_MS) : 0;
}

export function takeDose(state: SubstanceUse, item: ItemDef, now: number) {
  const dose = item.substance!;
  if (dose.kind === 'alcohol') {
    const prev = state.alcohol, load = Math.min(100, intoxication(state, now) + dose.strength);
    const sick = load >= 70;
    const habit = dependence(prev?.habit, now);
    const value = Math.min(100, habit + Math.max(13, Math.round(dose.strength / 2)));
    const alcohol: AlcoholUse = {
      load: sick ? load - 13 : load, at: now, habit: { value, at: now },
      sickUntil: sick ? now + 4_000 : 0,
      hangoverUntil: Math.max(prev?.hangoverUntil ?? 0, load >= 50 ? now + 5 * 60_000 : 0),
    };
    return { state: { ...state, alcohol }, sick, newDependence: habit < ADDICTION && value >= ADDICTION };
  }

  const prev = state.drugs?.[item.id];
  const habit = dependence(prev?.habit, now), value = Math.min(100, habit + dose.habit);
  const activeUntil = now + dose.seconds * 1000;
  const use: DrugUse = { habit: { value, at: now }, activeUntil, crashUntil: activeUntil + dose.crashSeconds * 1000 };
  return { state: { ...state, drugs: { ...state.drugs, [item.id]: use } }, sick: false, newDependence: habit < ADDICTION && value >= ADDICTION };
}

export function substanceEffects(c: Content, state: SubstanceUse, now = Date.now()) {
  const load = intoxication(state, now);
  const sick = isSick(state, now), hangover = (state.alcohol?.hangoverUntil ?? 0) > now && load < 15;
  const effects: SubstanceView['effects'] = [];
  let aim = load >= 15 ? -Math.floor(load / 12) : 0, speed = load >= 35 ? -load / 270 : 0;
  let melee = 0, defense = load >= 45 ? -2 : 0, ram = 0, fatigue = 0;
  const alcoholDependent = dependence(state.alcohol?.habit, now) >= ADDICTION;
  const alcoholWithdrawal = alcoholDependent && load < 15;
  if (alcoholDependent) effects.push({ id: 'alcohol', name: 'Alcohol', dependent: true, withdrawal: alcoholWithdrawal });
  if (alcoholWithdrawal) { aim -= 2; speed -= 0.08; fatigue += 12; }
  if (hangover) { aim -= 1; fatigue += 12; }
  for (const [id, use] of Object.entries(state.drugs ?? {})) {
    const item = c.items.find((d) => d.id === id);
    const dose = item?.substance;
    if (!item || dose?.kind !== 'drug') continue;
    const active = use.activeUntil > now;
    const crash = !active && use.crashUntil > now;
    const dependent = dependence(use.habit, now) >= ADDICTION, withdrawal = dependent && !active;
    if (active || crash || dependent) effects.push({ id, name: item.name, phase: active ? 'active' : crash ? 'crash' : undefined,
      until: active ? use.activeUntil : crash ? use.crashUntil : undefined, dependent, withdrawal });
    if (active) { aim += dose.aim; speed += dose.speed; melee += dose.melee; defense += dose.defense; ram += dose.ram; }
    if (crash) { aim += dose.crashAim; speed += dose.crashSpeed; fatigue += dose.fatigue; }
    if (withdrawal) { aim -= 1; defense -= 1; fatigue += 9; }
  }
  const status: SubstanceView = { drunk: Math.round(load), sick, hangover, aim, speed: Math.max(0.45, 1 + speed), effects };
  return { ...status, status, melee, defense, ram, fatigue };
}
