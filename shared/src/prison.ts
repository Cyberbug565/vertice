export const OFFENSES=['robo','fraude','contrabando','agresion','homicidio','fuga'] as const;
export type Offense=typeof OFFENSES[number];
export const OFFENSE_NAME:Record<Offense,string>={robo:'Robo / hurto',fraude:'Estafa / intrusión',contrabando:'Contrabando',agresion:'Agresión',homicidio:'Homicidio',fuga:'Quebrantamiento'};
export const WINGS=['patrimonio','fraude','violencia','alta'] as const;
export type Wing=typeof WINGS[number];
export const WING_NAME:Record<Wing,string>={patrimonio:'Módulo de Patrimonio',fraude:'Módulo de Fraude',violencia:'Módulo de Violentos',alta:'Alta Seguridad'};
export const PRISON_EXIT:[number,number]=[547,307];
export const prisonZone=(zone:string)=>zone.startsWith('penal-')&&zone!=='penal-hierro';
export const dutyAt=(hour:number)=>hour<6?'recuento':hour<8?'desayuno':hour<12?'trabajo':hour<14?'comida':hour<18?'patio':hour<21?'trabajo':'recuento';
export interface CountedOffense {kind:Offense;count:number}
export interface Sentence {
  id:string;wing:Wing;begins:number;ends:number;days:number;cell:[number,number];
  fine:number;debt:number;conduct:number;work:number;tunnel:number;lastWork?:string;
  charges:CountedOffense[];paroleUntil?:number;escapeAt?:number;disciplineUntil?:number;network?:string;
}
export const PRISON_ACTIONS=['estado','trabajar','comer','condicional','pagar','trato','cavar','carga','control','auxilio'] as const;
export type PrisonAction=typeof PRISON_ACTIONS[number];
export interface PrisonView {
  state:Sentence|null;wallet:number;bank:number;now:number;hour:number;dayMs:number;duty:string;
  target?:number;actions:PrisonAction[];detail?:string;hidden?:boolean;
}
