// Riesgo quirúrgico (valores provisionales configurables). Lo calcula el servidor y lo muestra el cliente antes de cobrar.
export interface SurgeryInput {
  skill: number; // 1..5 calidad del matasanos
  grade: number; // 1..5 grado del implante
  danger: number; // 0..1 peligrosidad del local
  body: number; // BODY efectivo del paciente
  rep: number; // reputación con la facción del matasanos
  stolen: boolean;
  unscrupulous: boolean;
  bonus: number; // ciberware y oficio (p. ej. biomonitor +0,08)
  humanityAfter: number;
  removal: boolean;
}
export function surgeryRisk(i: SurgeryInput) {
  const repTerm = Math.max(-30, Math.min(30, i.rep)) * 0.003;
  let survival = 0.62 + 0.075 * i.skill - 0.045 * (i.grade - 1) - 0.2 * i.danger + 0.01 * (i.body - 5) + repTerm + i.bonus;
  if (i.stolen) survival -= i.unscrupulous ? 0.02 : 0.05;
  if (i.humanityAfter < 20) survival -= 0.05;
  if (i.removal) survival += 0.06;
  survival = Math.max(0.05, Math.min(0.995, survival));
  const cleanGivenSurvive = Math.max(0.2, Math.min(0.99, 0.45 + 0.1 * i.skill - 0.04 * (i.grade - 1) - 0.3 * i.danger + (i.removal ? 0.1 : 0)));
  const theft = Math.max(0, Math.min(0.6, i.danger * 0.5 * (i.rep < 0 ? 1.5 : 1)));
  const death = 1 - survival;
  const label = death < 0.03 ? 'Baja' : death < 0.08 ? 'Moderada' : death < 0.18 ? 'Alta' : 'Extrema';
  return { survival, clean: survival * cleanGivenSurvive, theft, label };
}
