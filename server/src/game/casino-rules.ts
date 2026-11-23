import { randomInt } from 'node:crypto';
import { casinoCard, casinoMarket, marketReturn, RED_NUMBERS, type CasinoResult } from '@vertice/shared';
import { GameError } from './effects.js';

export function deck() {
  const cards = Array.from({length:52}, (_,i)=>i);
  for(let i=51;i>0;i--){ const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]]; }
  return cards;
}
export function blackjackValue(cards: number[]){
  let value=0,aces=0;
  for(const card of cards){const {rank}=casinoCard(card);value+=rank===14?11:Math.min(rank,10);if(rank===14)aces++;}
  while(value>21&&aces>0){value-=10;aces--;}
  return value;
}
export function pokerPay(cards: number[]): [string,number] {
  const ranks=cards.map(c=>casinoCard(c).rank).sort((a,b)=>a-b);
  const counts=ranks.map(r=>ranks.filter(n=>n===r).length),best=Math.max(...counts);
  const flush=cards.every(c=>Math.floor(c/13)===Math.floor(cards[0]/13));
  const straight=best===1 && (ranks[4]-ranks[0]===4 || ranks.join(',')==='2,3,4,5,14');
  if(straight&&flush)return ranks[0]===10?['Escalera real',250]:['Escalera de color',40];
  if(best===4)return ['Póker',25];
  if(best===3&&counts.includes(2))return ['Full',8];
  if(flush)return ['Color',5];
  if(straight)return ['Escalera',4];
  if(best===3)return ['Trío',3];
  if(counts.filter(n=>n===2).length===4)return ['Doble pareja',2];
  if(ranks.some((r,i)=>r>=11&&counts[i]===2))return ['Pareja de jotas o superior',1];
  return ['Sin premio',0];
}
export function singlePlay(game:'ruleta'|'rasca'|'deportes'|'caballos', id:string, stake:number, choice:string, heat:number):CasinoResult {
  const base={id,game,stake};
  if(game==='ruleta'){
    if(!['rojo','negro','par','impar'].includes(choice)&&!/^([0-9]|[12][0-9]|3[0-6])$/.test(choice))throw new GameError('Selecciona un número del 0 al 36 o una apuesta de color o paridad.');
    const number=randomInt(37),red=RED_NUMBERS.has(number),zero=number===0;
    const won=choice===String(number)||(!zero&&((choice==='rojo'&&red)||(choice==='negro'&&!red)||(choice==='par'&&number%2===0)||(choice==='impar'&&number%2!==0)));
    return {...base,number,payout:won?stake*(choice===String(number)?36:2):0,text:zero?'Cero verde':`${number} · ${red?'rojo':'negro'}`};
  }
  if(game==='rasca'){
    const roll=randomInt(1000), multiplier=roll<5?30:roll<24?10:roll<94?4:roll<249?2:0;
    const symbols=multiplier?[multiplier,multiplier,multiplier]:[2,4,10,30].sort((a,b)=>a-b);
    if(!multiplier){ const shift=randomInt(4);symbols.push(...symbols.splice(0,shift));symbols.pop(); }
    return {...base,symbols,payout:multiplier*stake,text:multiplier?`Tres símbolos iguales · ×${multiplier}`:'Sin premio'};
  }
  const match=casinoMarket(game,heat);
  if(!/^[0-5]$/.test(choice)||Number(choice)>=match.names.length)throw new GameError('Elige un participante.');
  const remaining=match.weights.map((weight,i)=>({weight,i})),order:number[]=[];
  while(remaining.length){
    let roll=randomInt(remaining.reduce((sum,x)=>sum+x.weight,0));
    const pos=remaining.findIndex(x=>(roll-=x.weight)<0);
    order.push(remaining.splice(pos,1)[0].i);
  }
  const winner=order[0];
  const score:[number,number]|undefined=game==='deportes'?(winner===1?[1,1]:winner===0?[2+randomInt(2),1]:[1,2+randomInt(2)]):undefined;
  return {...base,order,heat,score,payout:winner===Number(choice)?Math.floor(stake*marketReturn(match.weights[winner])):0,text:score?`${match.names[0]} ${score[0]}–${score[1]} ${match.names[2]}`:`Gana ${match.names[winner]}`};
}
