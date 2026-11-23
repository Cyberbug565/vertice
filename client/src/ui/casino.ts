import { CASINOS, CASINO_NAMES, RED_NUMBERS, ROULETTE, casinoCard, casinoMarket, marketReturn, type CasinoGame, type CasinoView, type ClientMsg } from '@vertice/shared';
import { newOpId, type Net } from '../net';
import { settings } from '../settings';
import { $ui, fmtMoney, h } from './dom';
import './casino.css';

type Command=Omit<Extract<ClientMsg,{t:'casino'}>,'t'|'seq'|'table'|'game'|'opId'>;
const icons:Record<CasinoGame,string>={ruleta:'◉',poker:'♠',blackjack:'♣',rasca:'✦',deportes:'⚡',caballos:'♞',duelo:'◈'};
const scratchIcons:Record<number,string>={2:'◈',4:'✦',10:'⬢',30:'♛'};
const titleCase=(s:string)=>s[0].toUpperCase()+s.slice(1);

export function casinoPanel(net:Net,initial:CasinoView){
  document.querySelector('#casino-panel')?.remove();
  let view=initial,game=view.hand&&view.games.includes(view.hand.game)?view.hand.game:view.games[0];
  let hold=0,pick='rojo',amount:number=CASINOS[view.venue].min;
  let pending:{seq:number;opId:string;input:Command;at:number}|undefined;
  let finalReady=true, lastResult='', revealTimer=0;
  const venue=CASINOS[view.venue];
  const close=()=>root.remove();
  const root=h('section',{id:'casino-panel',class:'casino panel'+(settings.reduceMotion?' motion-off':''),role:'dialog','aria-modal':'true','aria-label':venue.name,style:{'--c-accent':venue.accent}});
  root.style.setProperty('--c-accent',venue.accent);
  const head=h('header',{class:'casino-head'});
  const stage=h('div',{class:'casino-stage'});
  const controls=h('footer',{class:'casino-controls'});
  const error=h('p',{class:'casino-error',role:'alert'});
  root.append(head,stage,controls,error);
  $ui().append(root);
  const receive=(data:CasinoView,seq?:number)=>{
    if(data.table!==view.table)return;
    const old=view.hand?.id;
    view=data;
    if(old!==view.hand?.id)hold=0;
    if(seq===pending?.seq)pending=undefined;
    error.textContent='';
    finalReady=true;
    window.clearTimeout(revealTimer);
    if(view.result&&view.result.id!==lastResult&&view.result.game!=='rasca'){
      lastResult=view.result.id;
      finalReady=settings.reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(!finalReady)revealTimer=window.setTimeout(()=>{finalReady=true;const result=stage.querySelector<HTMLElement>('.casino-result');if(result)result.hidden=false;controls.querySelectorAll('button').forEach(b=>b.disabled=false);},view.result.game==='duelo'?1600:view.result.game==='ruleta'||view.result.game==='caballos'||view.result.game==='deportes'?1450:370);
    }
    render();
    if(view.result&&view.result.game!=='duelo')net.send({t:'casino',table:view.table,game:view.result.game,opId:newOpId(),action:'seen',round:view.result.id});
  };
  const ack=(seq:number,ok:boolean,reason?:string)=>{
    if(seq!==pending?.seq||ok)return false;
    pending=undefined;render();error.textContent=reason||'La mesa no pudo procesar la jugada.';return true;
  };
  const submit=(input:Command, prior?:string)=>{
    if(net.status!=='online'){error.textContent='Esperando conexión con la mesa.';return;}
    if(pending&&!prior)return;
    const opId=prior??newOpId();const seq=net.send({t:'casino',table:view.table,game,opId,...input});
    pending={seq,opId,input,at:performance.now()};error.textContent='';renderControls();
    window.setTimeout(()=>{if(root.isConnected&&pending?.seq===seq)renderControls();},6200);
  };
  function tag(text:string){return h('span',{class:'casino-tag'},text);}
  function cards(ids:number[],faceDown=false,select=false){
    return h('div',{class:'casino-cards'},...ids.map((id,i)=>{
      const c=casinoCard(id),held=!!(hold&(1<<i));
      const child=[h('small',{},c.label),h('strong',{},c.suit),h('small',{},c.label)];
      return select?h('button',{type:'button',class:'casino-card'+(c.red?' red':''),'aria-label':`Conservar ${c.label} ${c.suit}`,'aria-pressed':String(held),onclick:(ev:Event)=>{
        hold^=1<<i;(ev.currentTarget as HTMLButtonElement).setAttribute('aria-pressed',String(!!(hold&(1<<i))));
      }},child):h('div',{class:'casino-card'+(c.red?' red':'')},child);
    }),faceDown&&h('div',{class:'casino-card back','aria-label':'Carta oculta'},'◇'));
  }
  function wheel(result?:CasinoView['result']){
    const winner=result?.number, index=winner===undefined?0:ROULETTE.indexOf(winner);
    const rotor=h('div',{class:'casino-wheel'});
    const colors=ROULETTE.map(n=>n===0?'#13a47c':RED_NUMBERS.has(n)?'#a32f4c':'#253348');
    rotor.style.background=`conic-gradient(from -4.865deg, ${colors.map((c,i)=>`${c} ${i*100/37}% ${(i+1)*100/37}%`).join(',')})`;
    rotor.style.setProperty('--rotation',`${1080-index*360/37}deg`);
    if(winner!==undefined)rotor.classList.add('spinning');
    for(const [i,n] of ROULETTE.entries()){
      const a=i*2*Math.PI/37;
      rotor.append(h('span',{style:{left:`${50+43*Math.sin(a)}%`,top:`${50-43*Math.cos(a)}%`},'aria-hidden':'true'},n));
    }
    return h('div',{class:'casino-wheel-frame'},rotor,h('div',{class:'casino-wheel-hub'},'◈'),h('div',{class:'casino-pointer','aria-hidden':'true'},'▼'));
  }
  function scratch(result:NonNullable<CasinoView['result']>){
    const foil=h('canvas',{class:'casino-foil',width:560,height:175,'aria-hidden':'true'});
    const reveal=h('button',{class:'btn',onclick:show},'Descubrir boleto');
    const outcomes=h('div',{class:'casino-symbols',hidden:true},...(result.symbols??[]).map(n=>h('div',{},h('strong',{},scratchIcons[n]),h('small',{},`×${n}`))));
    const message=summary(result,true);
    const ctx=foil.getContext('2d');
    function show(){foil.remove();outcomes.hidden=false;message.hidden=false;reveal.remove();}
    if(ctx){
      const metal=ctx.createLinearGradient(0,0,560,175);metal.addColorStop(0,'#657d83');metal.addColorStop(.5,'#d4e3d6');metal.addColorStop(1,'#71848f');
      ctx.fillStyle=metal;ctx.fillRect(0,0,560,175);ctx.strokeStyle='#f5fff637';
      for(let i=-150;i<600;i+=11){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+170,175);ctx.stroke();}
      ctx.fillStyle='#193135';ctx.textAlign='center';ctx.font='bold 27px system-ui';ctx.fillText('RASCA PARA DESCUBRIR',280,96);
      let spent=0;
      const scratchAt=(ev:PointerEvent)=>{
        if(ev.type==='pointerdown'){foil.setPointerCapture(ev.pointerId);outcomes.hidden=false;}
        if(!foil.hasPointerCapture(ev.pointerId))return;
        const box=foil.getBoundingClientRect();
        ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc((ev.clientX-box.left)*560/box.width,(ev.clientY-box.top)*175/box.height,24,0,2*Math.PI);ctx.fill();
        if(++spent>40)show();
      };
      foil.addEventListener('pointerdown',scratchAt);foil.addEventListener('pointermove',scratchAt);
    }
    return h('div',{class:'casino-ticket'},h('div',{class:'casino-scratch'},outcomes,foil),reveal,message);
  }
  function summary(r:NonNullable<CasinoView['result']>,hidden=false){
    const diff=r.payout-r.stake;
    return h('div',{class:'casino-result',hidden,role:'status'},h('b',{},r.text),h('span',{},diff>0?'+ '+fmtMoney(diff):diff<0?'− '+fmtMoney(-diff):'Saldo sin cambio'),r.game==='duelo'&&r.payout>0?h('small',{},`${r.houses} viviendas · ${r.cars} vehículos`):false);
  }
  function market(result?:CasinoView['result']){
    const kind=game==='deportes'?'deportes':'caballos',event=casinoMarket(kind,result?.heat??view.heat);
    if(result){
      const positions=result.order??[];
      if(kind==='caballos')return h('div',{class:'casino-market'},h('h3',{},event.title),...event.names.map((name,i)=>{
        const lane=h('div',{class:'casino-lane'},h('span',{},name),h('i',{},'♞'));
        lane.style.setProperty('--lane-time',`${1020+positions.indexOf(i)*80}ms`);lane.style.setProperty('--finish',`${91-positions.indexOf(i)*4}%`);
        return lane;
      }));
      return h('div',{class:'casino-score'},h('h3',{},event.title),h('div',{class:'casino-scoreline'},event.names[0],h('strong',{},(result.score??[0,0]).join(' – ')),event.names[2]),h('div',{class:'casino-matchbar'}));
    }
    return h('div',{class:'casino-market'},h('h3',{},event.title),h('p',{},'Selecciona un resultado · cuotas simuladas'),...event.names.map((name,i)=>h('button',{class:'casino-market-row','aria-pressed':String(pick===String(i)),onclick:()=>{pick=String(i);renderStage();}},h('span',{},name),tag('×'+marketReturn(event.weights[i]).toFixed(2)))));
  }
  function renderStage(){
    stage.replaceChildren();
    const r=view.result?.game===game?view.result:undefined, hand=view.hand?.game===game?view.hand:undefined;
    if(game==='ruleta'){
      stage.append(wheel(r));
      if(!r)stage.append(h('div',{class:'casino-roulette-picks','aria-label':'Tipo de apuesta'},...['rojo','negro','par','impar'].map(s=>h('button',{class:'btn','aria-pressed':String(pick===s),onclick:()=>{pick=s;renderStage();}},titleCase(s))),
        h('select',{'aria-label':'Apostar a un número',onchange:(e:Event)=>{pick=(e.target as HTMLSelectElement).value;renderStage();}},h('option',{value:'',selected:!/^\d+$/.test(pick),disabled:true},'Pleno 0–36'),...Array.from({length:37},(_,i)=>h('option',{value:String(i),selected:pick===String(i)},i)))));
    }else if(game==='blackjack'||game==='poker'){
      if(game==='blackjack')stage.append(h('p',{class:'casino-kicker'},'Banca'),cards(r?.dealer??(hand?.up===undefined?[]:[hand.up]),!!hand||!r));
      stage.append(h('p',{class:'casino-kicker'},game==='blackjack'?'Tu mano':'Selecciona las cartas que quieres conservar'),
        cards(hand?.player??r?.player??[],!hand&&!r,!!hand&&game==='poker'));
      if(!hand&&!r)stage.append(h('p',{},game==='blackjack'?'Acércate a 21. La banca se planta en 17.':'Pareja de jotas o superior. Un solo descarte.'));
      if(game==='poker')stage.append(h('details',{class:'casino-pays'},h('summary',{},'Pagos'),h('p',{},'Jotas ×1 · Doble pareja ×2 · Trío ×3 · Escalera ×4 · Color ×5 · Full ×8 · Póker ×25 · Escalera de color ×40 · Real ×250')));
    }else if(game==='rasca'){
      if(r){stage.append(scratch(r));return;}
      stage.append(h('div',{class:'casino-ticket intro-ticket'},h('strong',{},'✦'),h('h3',{},'Boleto holográfico'),h('p',{},'Encuentra tres símbolos iguales · hasta ×30')));
    }else if(game==='duelo'){
      const i=view.invite;
      stage.append(h('div',{class:'casino-duel'+(r?' revealed':'')},h('div',{class:'casino-eclipse','aria-hidden':'true'},h('i',{class:'casino-revolver'})),h('h3',{},i?`${i.incoming?'Desafío de':'Desafío a'} ${i.name}`:'Duelo de La Reserva'),
        h('p',{},'Duelo con un revólver de La Reserva. Muerte permanente. Quien gane hereda el saldo, las viviendas y los vehículos del otro personaje. Ambos jugadores deben aceptar.')));
      if(!i&&!r)stage.append(h('div',{class:'casino-guests'},...(view.guests??[]).map(o=>h('button',{class:'btn',onclick:()=>submit({action:'challenge',target:o.id})},'Desafiar a '+o.name)),!(view.guests?.length)&&h('p',{},'No hay otro invitado junto a la mesa.')));
    }else stage.append(market(r));
    if(r)stage.append(summary(r,!finalReady));
  }
  function renderControls(){
    controls.replaceChildren();
    if(pending){
      const active=pending;
      controls.append(h('span',{role:'status'},'Procesando jugada…'));
      if(performance.now()-active.at>6000)controls.append(h('button',{class:'btn',onclick:()=>submit(active.input,active.opId)},'Reintentar'));
      return;
    }
    const button=(label:string,input:Command,primary=false)=>h('button',{class:'btn'+(primary?' primary':''),disabled:!finalReady,onclick:()=>submit(input)},label);
    const hand=view.hand;
    if(game==='duelo'){
      const i=view.invite;
      if(!i){controls.append(button('Actualizar invitados',{action:'view'}));return;}
      if(i.incoming)controls.append(h('button',{class:'btn danger',onclick:()=>{
        if(!root.querySelector('.casino-consent'))controls.append(h('div',{class:'casino-consent'},h('b',{},'Confirmo que puedo perder este personaje y todo su patrimonio.'),button('Confirmar duelo',{action:'accept',round:i.id},true)));
      }},'Aceptar desafío'));
      controls.append(button(i.incoming?'Rechazar':'Cancelar desafío',{action:'decline',round:i.id}));return;
    }
    if(hand){
      if(hand.game!==game){controls.append(h('p',{},'Termina tu mano pendiente en su mesa.'));return;}
      if(game==='blackjack')controls.append(button('Pedir carta',{action:'hit',round:hand.id}),button('Plantarse',{action:'stand',round:hand.id},true));
      else controls.append(h('button',{class:'btn primary',onclick:()=>submit({action:'draw',round:hand.id,hold})},'Cambiar cartas'));
      return;
    }
    const bets=h('div',{class:'casino-bet-chips'},...[venue.min,Math.min(venue.max,venue.min*5),venue.max].map(n=>h('button',{class:'btn chip',onclick:()=>{amount=n;renderControls();}},fmtMoney(n))));
    const stake=h('input',{type:'number',min:venue.min,max:venue.max,step:1,value:String(amount),'aria-label':'Importe en eurodólares',oninput:(e:Event)=>{amount=(e.target as HTMLInputElement).valueAsNumber;}});
    const action=h('button',{class:'btn primary',disabled:!finalReady,onclick:()=>{
      if(!Number.isSafeInteger(amount)||amount<venue.min||amount>venue.max){error.textContent='Elige un importe dentro de los límites de la sala.';return;}
      submit({action:'bet',stake:amount,pick,heat:view.heat});
    }},game==='rasca'?'Comprar boleto':game==='blackjack'||game==='poker'?'Repartir':game==='ruleta'?'Girar ruleta':'Confirmar apuesta');
    if(view.result&&['caballos','deportes','ruleta'].includes(game)){
      controls.append(button(game==='ruleta'?'Nueva apuesta':'Volver a la cartelera',{action:'view'},true));return;
    }
    controls.append(bets,h('label',{class:'casino-stake'},'Apuesta',stake),action);
    if(!view.result&&(game==='caballos'||game==='deportes'))controls.append(button('Actualizar',{action:'view'}));
  }
  function render(){
    head.replaceChildren(h('div',{},h('p',{class:'casino-kicker'},venue.name+' · '+venue.tier),h('h2',{},icons[game]+' '+CASINO_NAMES[game]),h('p',{class:'casino-limit'},game==='duelo'?'Sala privada':`${fmtMoney(venue.min)} a ${fmtMoney(venue.max)} por apuesta`)),
      h('div',{class:'casino-head-right'},tag('Saldo '+fmtMoney(view.balance)),h('button',{class:'btn','aria-label':'Cerrar casino',onclick:close},'✕')));
    renderStage();renderControls();
  }
  if(game==='deportes'||game==='caballos')pick='0';
  receive(initial);
  head.querySelector('button')?.focus();
  return {receive,ack,root,table:initial.table};
}
