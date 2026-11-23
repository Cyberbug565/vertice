export const CLUB_DANCES = ['neon', 'onda', 'orbita', 'espejo', 'rebote', 'robot', 'uprock'] as const;
export const DANCE_IDS = [...CLUB_DANCES, 'entrenar', 'provocar'] as const;
export type DanceId = (typeof DANCE_IDS)[number];

export const DANCES: Record<DanceId, { name: string; icon: string; detail: string }> = {
  uprock: {name:'Brooklyn Uprock',icon:'♫',detail:'Cruza los pies, baja el cuerpo y vuelve al ritmo.'},
  entrenar: {name:'Ensayar boxeo',icon:'◎',detail:'Entrena una combinación de puños en el sitio.'},
  provocar: {name:'Provocar',icon:'!',detail:'Desafía a quien tengas delante con un gesto.'},
  neon: { name: 'Paso Neón', icon: '↔', detail: 'Dos pasos laterales con brazos en contratiempo.' },
  onda: { name: 'Onda', icon: '∿', detail: 'El cuerpo ondula desde las rodillas hasta los hombros.' },
  orbita: { name: 'Órbita', icon: '⟳', detail: 'Giro en el sitio con los brazos abiertos.' },
  espejo: { name: 'Espejo', icon: '◇', detail: 'Cambia el peso de lado y repite el gesto con el otro brazo.' },
  rebote: { name: 'Rebote', icon: '↑', detail: 'Saltitos cortos y puños arriba.' },
  robot: { name: 'Robot', icon: '⊡', detail: 'Poses angulares con pausas marcadas.' },
};

export const UNDERWORLD_RANKS = [
  { min: 0, name: 'Aspirante' },
  { min: 2, name: 'Corredor' },
  { min: 5, name: 'Enlace' },
  { min: 10, name: 'Operador' },
] as const;
