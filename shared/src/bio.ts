// v0.6 · Historia del personaje al crearlo: objetivo vital (con recompensa al cumplirlo), infancia y giro vital.
export const OBJECTIVES = [
  { id: 'rico', name: 'Hacerme rico/a', desc: 'Salir de la miseria a cualquier precio. Meta: reunir 50.000 €$.', bonus: 'Empiezas con +150 €$', money: 150, skills: {} as Record<string, number> },
  { id: 'leyenda', name: 'Ser leyenda de la calle', desc: 'Que todo Vértice conozca tu nombre. Meta: 40 de reputación callejera.', bonus: '+2 a Intimidación', money: 0, skills: { intimidacion: 2 } },
  { id: 'cromo', name: 'Más máquina que humano', desc: 'Superar los límites del cuerpo. Meta: 5 implantes instalados a la vez.', bonus: '+3 a Filo', money: 0, skills: { filo: 3 } },
  { id: 'hogar', name: 'Un hogar propio', desc: 'Dejar de dormir en cápsulas y portales. Meta: comprar una vivienda.', bonus: '+2 a Negociación', money: 0, skills: { negociacion: 2 } },
  { id: 'maestria', name: 'Ser el/la mejor en algo', desc: 'Dominar un oficio como nadie. Meta: nivel 20 en cualquier habilidad.', bonus: '+2 puntos de habilidad al crear', money: 0, skills: {} },
] as const;
export const CHILDHOODS = [
  { id: 'calle', name: 'Criado/a en la calle', desc: 'Aprendiste a correr y a que no te vieran.', skills: { sigilo: 2, atletismo: 1 } as Record<string, number>, money: 0 },
  { id: 'acomodada', name: 'Familia acomodada', desc: 'Colegio privado, buenos modales y algo de dinero.', skills: { negociacion: 2 }, money: 300 },
  { id: 'taller', name: 'Hijo/a de mecánicos', desc: 'Creciste entre motores y soldadores.', skills: { reparacion: 2, conduccion: 1 }, money: 0 },
  { id: 'hospital', name: 'Pasillos de hospital', desc: 'Tu madre era enfermera de guardia.', skills: { medicina: 2, percepcion: 1 }, money: 0 },
  { id: 'red', name: 'Enganchado/a a la red', desc: 'A los diez años ya hackeabas el colegio.', skills: { interfaz: 2, investigacion: 1 }, money: 0 },
] as const;
export const EVENTS = [
  { id: 'traicion', name: 'Una traición', desc: 'Alguien de confianza te vendió. Ahora miras dos veces.', skills: { percepcion: 1, intimidacion: 1 } as Record<string, number>, money: 0 },
  { id: 'deuda', name: 'Una deuda', desc: 'Debes dinero a quien no debes. Empiezas con menos, pero aprendiste rápido.', skills: {}, money: -100, points: 2 },
  { id: 'perdida', name: 'Una pérdida', desc: 'Perdiste a alguien. Desde entonces actúas para no sentir.', skills: { actuacion: 2 }, money: 0 },
  { id: 'pelea', name: 'Una pelea que lo cambió todo', desc: 'Ganaste. El otro no se levantó.', skills: { cuerpo: 2 }, money: 0 },
  { id: 'servicio', name: 'Servicio militar', desc: 'Dos años de uniforme y disparos.', skills: { armas: 2 }, money: 0 },
] as const;
/** Puntos de habilidad que se reparten al crear el personaje (máximo 3 por habilidad). */
export const CREATION_SKILL_POINTS = 10;
export const CREATION_SKILL_MAX = 3;
