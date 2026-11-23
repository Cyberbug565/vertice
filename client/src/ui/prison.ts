import { OFFENSE_NAME, WING_NAME, type PrisonAction, type PrisonView, type ServerMsg } from '@vertice/shared';
import { type Net, newOpId } from '../net';
import { $ui, fmtMoney, h } from './dom';

const actions:Record<PrisonAction,string>={
  estado:'Ver expediente', trabajar:'Empezar turno', comer:'Recoger ración', condicional:'Solicitar la salida',
  pagar:'Abonar deuda', trato:'Negociar un intercambio', cavar:'Trabajar en la obra', carga:'Ocultarse en el contenedor',
  control:'Abrir la salida', auxilio:'Pedir asistencia',
};
const shifts=[['00:00–06:00','Recuento'],['06:00–08:00','Desayuno'],['08:00–12:00','Trabajo'],
  ['12:00–14:00','Comida'],['14:00–18:00','Patios'],['18:00–21:00','Trabajo'],['21:00–00:00','Recuento']];
const crews:Record<string,string>={salmuera:'La Salmuera',foso:'Los del Foso',engranajes:'Engranajes',kitsune:'Kitsune'};

export function prisonPanel(net:Net,view:PrisonView){
  const existing=document.getElementById('penal-panel');
  const panel=existing??h('section',{id:'penal-panel',class:'panel penal-panel','aria-label':'Expediente penitenciario'});
  const s=view.state,hidden=view.hidden;
  const custody=s&&!s.escapeAt&&!s.paroleUntil;
  const time=Math.max(0,s?(s.paroleUntil??s.ends)-view.now:0);
  const totalHours=Math.ceil(time*24/view.dayMs);
  const remaining=`${Math.floor(totalHours/24)} d ${totalHours%24} h`;
  const inReview=!!(s&&view.now>=s.begins+(s.ends-s.begins)*.65&&s.conduct>=75&&s.work>=3&&(s.disciplineUntil??0)<=view.now);
  const frame=h('div',{class:'penal-content'},
    h('header',{class:'penal-header'},h('div',{},h('p',{},'SERVICIO PENITENCIARIO'),h('h2',{},'Las Salinas')),
      h('button',{class:'btn small',onclick:()=>panel.remove(),'aria-label':'Cerrar expediente'},'Cerrar')),
    h('div',{class:'penal-status'},s?.escapeAt?'Orden de búsqueda por fuga':custody?'Cumpliendo condena':s&&time>0?'En libertad condicional':s?'Expediente cumplido':'Información para visitantes',
      h('strong',{},(custody||s&&!s.escapeAt&&time>0)?remaining:'')),
    s?h('div',{class:'penal-details'},
      h('span',{},'Módulo de ingreso',h('strong',{},WING_NAME[s.wing])),
      h('span',{},'Conducta',h('strong',{},`${s.conduct} / 100`),h('progress',{value:s.conduct,max:100})),
      h('span',{},'Multa pendiente',h('strong',{},fmtMoney(s.debt))),
      h('span',{},'Saldo bancario',h('strong',{},fmtMoney(view.bank))),
      h('span',{},'Turnos realizados',h('strong',{},s.work)),
      s.network?h('span',{},'Contacto',h('strong',{},crews[s.network])):null):null,
    s?h('p',{class:'penal-charges'},s.charges.map(c=>`${OFFENSE_NAME[c.kind]} ×${c.count}`).join(' · ')):null,
    custody?h('p',{class:'penal-caption'},inReview?'Puedes solicitar la revisión en la mesa de expedientes.':'Revisión de libertad condicional tras el 65 % de condena, conducta de 75 y tres turnos completados.'):null,
    view.detail?h('p',{class:'penal-context',role:'status'},view.detail):null,
    view.actions.length?h('div',{class:'penal-actions'},view.actions.map(action=>h('button',{class:'btn',onclick:()=>
      net.send({t:'penal',action,target:view.target,opId:newOpId()})},action==='carga'&&hidden?'Salir del contenedor':actions[action]))):null,
    h('details',{open:!view.actions.length},h('summary',{},'Horario del penal · '+String(Math.floor(view.hour)).padStart(2,'0')+':'+String(Math.floor(view.hour%1*60)).padStart(2,'0')),
      h('div',{class:'penal-schedule'},shifts.map(([span,name])=>h('div',{},h('time',{},span),h('span',{class:name.toLowerCase()===view.duty||name==='Patios'&&view.duty==='patio'?'current':''},name))))));
  panel.replaceChildren(frame);
  if(!existing)$ui().append(panel);
}

export function bankPanel(net:Net,msg:Extract<ServerMsg,{t:'bank'}>){
  document.getElementById('bank-panel')?.remove();
  const sum=h('input',{type:'number',min:1,max:10000000,step:1,required:true,placeholder:'Cantidad','aria-label':'Cantidad'});
  const send=(action:'deposit'|'withdraw')=>{
    if(!sum.reportValidity())return;
    net.send({t:'bank',action,target:msg.target,amount:sum.valueAsNumber,opId:newOpId()});
  };
  const panel=h('section',{id:'bank-panel',class:'panel penal-panel bank-panel','aria-label':'Cajero automático'},
    h('div',{class:'penal-content'},
      h('header',{class:'penal-header'},h('div',{},h('p',{},'RED DE CAJEROS'),h('h2',{},'Cuenta bancaria')),
        h('button',{class:'btn small',onclick:()=>panel.remove()},'Cerrar')),
      h('div',{class:'penal-details'},h('span',{},'Efectivo',h('strong',{},fmtMoney(msg.wallet))),h('span',{},'Saldo bancario',h('strong',{},fmtMoney(msg.bank)))),
      sum,h('div',{class:'penal-actions'},h('button',{class:'btn primary',onclick:()=>send('deposit')},'Ingresar'),
        h('button',{class:'btn',onclick:()=>send('withdraw')},'Retirar'))));
  $ui().append(panel);
}
