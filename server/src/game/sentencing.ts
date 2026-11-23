import {OFFENSES,type CountedOffense,type Offense,type Wing} from '@vertice/shared';

export function inferCharge(reason:string):Offense|undefined {
  if(/hurt|robo|carterista/i.test(reason))return 'robo';
  if(/fraude|estafa|intrusión|trace|red/i.test(reason))return 'fraude';
  if(/contrabando|trapiche|trabajo ilegal|drop/i.test(reason))return 'contrabando';
  if(/agresi|asalto|armada/i.test(reason))return 'agresion';
}

const fines:Record<Offense,number>={robo:1800,fraude:4200,contrabando:3500,agresion:4800,homicidio:18000,fuga:9000};
export function sentenceFor(pending:Partial<Record<Offense,number>>,prior:Partial<Record<Offense,number>>,wanted:number) {
  const charges:CountedOffense[]=OFFENSES.filter(kind=>(pending[kind]??0)>0).map(kind=>({kind,count:pending[kind]!}));
  if(!charges.length)charges.push({kind:'agresion',count:1});
  let days=0,fine=0,wing:Wing='patrimonio';
  let severity=-1;
  for(const {kind,count} of charges){
    const repeats=Math.min(3,Math.max(0,(prior[kind]??0)+count-1));
    const d=kind==='robo'?Math.min(6,3+repeats):kind==='fraude'?3+repeats:kind==='contrabando'?3+repeats:
      kind==='agresion'?4+repeats:kind==='homicidio'?count>=2?14:5:7+repeats;
    const rank=kind==='homicidio'?count>=2?7:6:kind==='fuga'?8:kind==='agresion'?4:kind==='fraude'?3:kind==='contrabando'?2:1;
    if(rank>severity){severity=rank;wing=rank>=7?'alta':rank>=4?'violencia':rank===3?'fraude':'patrimonio';}
    days=Math.max(days,d);
    fine+=fines[kind]*Math.min(15,count)+Math.floor(fines[kind]*repeats*.35);
  }
  return {charges,days:Math.min(21,days+Math.min(3,charges.length-1)),fine:fine+Math.floor(Math.max(0,wanted))*350,wing};
}
