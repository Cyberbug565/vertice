import {randomInt,randomUUID} from 'node:crypto';
import {CASINOS,VIP,type CasinoView,type CasinoResult,type CasinoGame,type CasinoId,type ClientMsg} from '@vertice/shared';
import {GameError} from '../game/effects.js';
import {buildSheet,type PlayerState} from '../game/player.js';
import type {Queryable} from '../db/db.js';
import {blackjackValue,deck,pokerPay,singlePlay} from '../game/casino-rules.js';
import type {Entity} from './entity.js';
import type {PlayerConn,World} from './world.js';

type Command=Extract<ClientMsg,{t:'casino'}>;
type Hand={id:string;game:'blackjack'|'poker';venue:CasinoId;stake:number;player:number[];dealer:number[];deck:number[]};
type Table={id:number;zone:string;venue:CasinoId;title:string;games:CasinoGame[];x:number;y:number};
type Invite={id:string; from:PlayerConn; to:PlayerConn; table:Table; expires:number};
type Replay={result?:CasinoResult};
const moneyFormat=(n:number)=>n.toLocaleString('es-ES')+' €$';
const near=(e:Entity,t:Table)=>e.zone.id===t.zone&&Math.hypot(e.x-t.x,e.y-t.y)<=3.5;
const heatAt=()=>Math.floor(Date.now()/90000)%3;

export class Casino {
  private readonly invites=new Map<string,Invite>();
  private readonly busy=new Set<string>();
  constructor(private readonly world:World){}

  vip(p:PlayerState){return p.money>=VIP.balance&&(p.rep.get('calle')??0)>=VIP.reputation;}
  async deny(p:PlayerState,from:string,to:string):Promise<string|undefined>{
    if(to===VIP.zone&&!this.vip(p))return 'El acceso está reservado a los invitados de La Reserva.';
    if(to==='casino-meridiano'&&!from.startsWith('casino-meridiano-')&&p.money<CASINOS.meridiano.entry)
      if((await this.read(this.world.db,p.charId))?.venue!=='meridiano')return 'Gran Meridiano exige un saldo mínimo de '+moneyFormat(CASINOS.meridiano.entry)+'.';
  }
  private table(id:number){
    const e=this.world.entities.get(id),z=e?.zone.def;
    if(!e||e.objKind!=='casino'||!z?.casino)throw new GameError('Esa mesa no existe.');
    const games=z.objects.find(o=>o.id===e.objId)?.games;
    if(!games?.length)throw new GameError('La mesa está cerrada.');
    return {id,zone:z.id,venue:z.casino.id,title:z.name,games,x:e.x,y:e.y};
  }
  private assertAt(c:PlayerConn,t:Table) {
    if(c.closed||!c.e||!c.p||c.p.status!=='alive'||(c.p as PlayerState&{dead?:boolean}).dead||
      c.p.sleeping||c.p.carrying||c.p.driving||c.e.transit||c.e.ghostOf||!near(c.e,t))throw new GameError('Acércate a la mesa con tu personaje activo.');
    if(t.zone===VIP.zone&&!this.vip(c.p))throw new GameError('Tu personaje ya no cumple los requisitos VIP.');
  }
  private async read(q:Queryable,char:string):Promise<Hand|undefined>{
    return (await q.query<{state:Hand}>('SELECT state FROM casino_hands WHERE character_id=$1',[char])).rows[0]?.state;
  }
  async open(c:PlayerConn,id:number) {
    const t=this.table(id);this.assertAt(c,t);
    const char=c.p!.charId;
    const hand=await this.read(this.world.db,char);
    const latest=!hand ? (await this.world.db.query<{result:CasinoResult}>(
      'SELECT result FROM casino_receipts WHERE character_id=$1 AND venue=$2 AND game=$3 AND received=false',
      [char,t.venue,t.games[0]])).rows[0]?.result:undefined;
    await this.send(c,t,hand,latest,true);
  }
  disconnect(c:PlayerConn){const i=this.invites.get(c.accountId);if(i)this.clear(i);}
  private active(c:PlayerConn){
    const invite=this.invites.get(c.accountId);
    if(invite && (invite.expires<Date.now()||invite.from.closed||invite.to.closed)){this.clear(invite);return;}
    return invite;
  }
  private clear(i:Invite){this.invites.delete(i.from.accountId);this.invites.delete(i.to.accountId);}
  private async send(c:PlayerConn,t:Table,hand?:Hand,result?:CasinoResult,open?:boolean,seq?:number){
    const view:CasinoView={venue:t.venue,zone:t.zone,title:t.title,table:t.id,games:t.games,balance:c.p!.money,heat:heatAt(),result};
    if(hand&&hand.venue===t.venue)view.hand={id:hand.id,game:hand.game,stake:hand.stake,player:hand.player,up:hand.dealer[0]};
    if(t.games.includes('duelo')){
      view.guests=[...this.world.conns.values()].filter(o=>o!==c&&!o.closed&&o.e&&near(o.e,t)&&o.p?.status==='alive'&&this.vip(o.p)).map(o=>({id:o.e!.id,name:o.p!.name}));
      const i=this.active(c);
      if(i)view.invite={id:i.id,name:(i.from===c?i.to:i.from).p!.name,incoming:i.to===c,expires:i.expires};
    }
    this.world.send(c,{t:'casino',view,open,seq});
  }
  async play(c:PlayerConn,m:Command){
    const table=this.table(m.table);
    this.assertAt(c,table);
    const p=c.p!;
    if(this.busy.has(c.accountId))throw new GameError('El duelo se está resolviendo.');
    if(m.action==='view')return this.send(c,table,await this.read(this.world.db,p.charId),undefined,false,m.seq);
    if(m.action==='seen'){
      if(m.game && table.games.includes(m.game))await this.world.db.query("UPDATE casino_receipts SET received=true WHERE character_id=$1 AND venue=$2 AND game=$3 AND result->>'id'=$4",[p.charId,table.venue,m.game,m.round??'']);
      return;
    }
    if(table.games.includes('duelo'))return this.duel(c,table,m);
    if(m.game===undefined||m.game==='duelo'||!table.games.includes(m.game))throw new GameError('Ese juego se sirve en otra mesa.');
    const game=m.game, key='casino:'+p.charId+':'+m.opId;
    const out=await this.world.db.tx(async q=>{
      const row=(await q.query<{money:string;status:string}>('SELECT money,status FROM characters WHERE id=$1 FOR UPDATE',[p.charId])).rows[0];
      this.assertAt(c,table);
      if(!row||row.status!=='alive')throw new GameError('El personaje no puede apostar.');
      const balance=Number(row.money);
      const existing=(await q.query<{result:Replay}>("SELECT result FROM ops WHERE op_id=$1 AND character_id=$2 AND kind='casino'",[key,p.charId])).rows[0];
      const previous=await this.read(q,p.charId);
      if(existing)return {balance,hand:previous,result:existing.result.result};
      let hand:Hand|undefined=previous, result:CasinoResult|undefined, delta=0;
      if(m.action==='bet'){
        if(previous)throw new GameError('Tienes una mano pendiente en '+CASINOS[previous.venue].name+'. Termínala en su mesa.');
        const stake=m.stake??0,rules=CASINOS[table.venue],heat=heatAt();
        if(stake<rules.min||stake>rules.max)throw new GameError('La apuesta debe estar entre '+moneyFormat(rules.min)+' y '+moneyFormat(rules.max)+'.');
        if(balance<stake)throw new GameError('Saldo insuficiente.');
        if((game==='deportes'||game==='caballos')&&m.heat!==heat)throw new GameError('La cartelera ha cambiado. Actualiza la mesa.');
        const id=randomUUID();
        delta=-stake;
        if(game==='poker'||game==='blackjack'){
          const cards=deck();hand={id,game,venue:table.venue,stake,deck:cards,player:cards.splice(0,game==='poker'?5:2),dealer:game==='blackjack'?cards.splice(0,2):[]};
          if(game==='blackjack'&&(blackjackValue(hand.player)===21||blackjackValue(hand.dealer)===21)){
            result=finishBlackjack(hand);hand=undefined;
          }
        }else result=singlePlay(game,id,stake,m.pick??'',heat);
      }else{
        if(!hand||hand.id!==m.round||hand.venue!==table.venue||hand.game!==game)throw new GameError('La mano ya ha terminado o pertenece a otra mesa.');
        if(game==='poker'&&m.action==='draw'){
          const hold=m.hold??0;
          const player=hand.player.map((id,i)=>hold&(1<<i)?id:hand!.deck.shift()!);
          const [text,rate]=pokerPay(player);
          result={id:hand.id,game,stake:hand.stake,player,text,payout:hand.stake*rate};hand=undefined;
        }else if(game==='blackjack'&&(m.action==='hit'||m.action==='stand')){
          if(m.action==='hit')hand.player.push(hand.deck.shift()!);
          if(m.action==='stand'||blackjackValue(hand.player)>=21){result=finishBlackjack(hand);hand=undefined;}
        }else throw new GameError('Esa jugada no está disponible.');
      }
      delta+=result?.payout??0;
      const next=balance+delta;
      if(!Number.isSafeInteger(next))throw new GameError('El saldo superaría el límite de la cuenta.');
      if(m.action==='bet')await this.ledger(q,p.charId,key+':apuesta',-(m.stake!),balance-m.stake!,'Apuesta · '+CASINOS[table.venue].name);
      if(result?.payout)await this.ledger(q,p.charId,key+':premio',result.payout,next,'Premio · '+CASINOS[table.venue].name);
      if(delta)await q.query('UPDATE characters SET money=$2 WHERE id=$1',[p.charId,next]);
      if(hand)await q.query('INSERT INTO casino_hands (character_id,state) VALUES ($1,$2) ON CONFLICT (character_id) DO UPDATE SET state=EXCLUDED.state',[p.charId,JSON.stringify(hand)]);
      else if(previous)await q.query('DELETE FROM casino_hands WHERE character_id=$1',[p.charId]);
      if(result)await q.query('INSERT INTO casino_receipts (character_id,venue,game,result,received) VALUES ($1,$2,$3,$4,false) ON CONFLICT (character_id,venue,game) DO UPDATE SET result=EXCLUDED.result,received=false',[p.charId,table.venue,game,JSON.stringify(result)]);
      await q.query("INSERT INTO ops (op_id,character_id,kind,result) VALUES ($1,$2,'casino',$3)",[key,p.charId,JSON.stringify({result})]);
      return {balance:next,hand,result};
    });
    p.money=out.balance;
    this.world.send(c,{t:'sheet',sheet:buildSheet(this.world.c,p)});
    await this.send(c,table,out.hand,out.result,false,m.seq);
  }
  private async ledger(q:Queryable,char:string,key:string,delta:number,balance:number,reason:string){
    await q.query('INSERT INTO ledger (op_id,character_id,delta,balance_after,reason) VALUES ($1,$2,$3,$4,$5)',[key,char,delta,balance,reason]);
  }
  private async duel(c:PlayerConn,t:Table,m:Command){
    if(m.action==='challenge'){
      const target=m.target===undefined?undefined:this.world.entities.get(m.target)?.conn;
      if(!target||target===c||target.accountId===c.accountId)throw new GameError('Elige a otro jugador de la sala.');
      this.assertAt(target,t);
      if(this.active(c)||this.active(target)||this.busy.has(target.accountId))throw new GameError('Hay un desafío pendiente.');
      const i={id:randomUUID(),from:c,to:target,table:t,expires:Date.now()+30000};
      this.invites.set(c.accountId,i);this.invites.set(target.accountId,i);
      await this.send(c,t,undefined,undefined,false,m.seq);await this.send(target,t,undefined,undefined,true);
      return;
    }
    const i=this.active(c);
    if(!i||m.round!==i.id||t.id!==i.table.id)throw new GameError('Ese desafío ha caducado.');
    if(m.action==='decline'){
      this.clear(i);await this.send(c,t,undefined,undefined,false,m.seq);
      const other=i.from===c?i.to:i.from;if(!other.closed)await this.send(other,t);return;
    }
    if(m.action!=='accept'||i.to!==c)throw new GameError('Solo el invitado puede aceptar.');
    this.clear(i);
    const other=i.from;
    this.busy.add(c.accountId);this.busy.add(other.accountId);
    const peerQueue=other.queue;
    // También se encolan detrás del resultado las compras del otro participante.
    let released!:()=>void;
    const barrier=new Promise<void>(done=>{released=done;});
    this.world.enqueue(other,()=>barrier);
    try{
      await peerQueue;
      this.assertAt(c,t);this.assertAt(other,t);
      const [winner,loser]=randomInt(2)===0?[c,other]:[other,c];
      await this.settleDuel(i,winner,loser);
    }finally{
      this.busy.delete(c.accountId);this.busy.delete(other.accountId);released();
    }
  }
  private async settleDuel(i:Invite,winner:PlayerConn,loser:PlayerConn){
    const wp=winner.p!,lp=loser.p!,e=loser.e!;
    let prize=0,balance=0,homes:{house_id:string;price:string}[]=[],cars:{id:string;car_id:string}[]=[];
    await this.world.survival.die(lp,e,'Ruleta rusa en La Reserva',wp,{
      estate:async q=>{
        const rows=(await q.query<{id:string;money:string;status:string}>('SELECT id,money,status FROM characters WHERE id=$1 OR id=$2 FOR UPDATE',[wp.charId,lp.charId])).rows;
        const w=rows.find(r=>r.id===wp.charId), l=rows.find(r=>r.id===lp.charId);
        if(w?.status!=='alive'||!l||Number(w.money)<VIP.balance||Number(l.money)<VIP.balance)throw new GameError('El saldo de un participante ha cambiado.');
        prize=Number(l.money);balance=Number(w.money)+prize;
        if(!Number.isSafeInteger(balance))throw new GameError('El saldo del ganador superaría el límite de la cuenta.');
        await q.query('UPDATE characters SET money=$2 WHERE id=$1',[wp.charId,balance]);
        await q.query('UPDATE characters SET money=0 WHERE id=$1',[lp.charId]);
        await this.ledger(q,wp.charId,'duelo:'+i.id+':herencia',prize,balance,'Herencia de La Reserva');
        await this.ledger(q,lp.charId,'duelo:'+i.id+':patrimonio',-prize,0,'Patrimonio cedido en La Reserva');
        homes=(await q.query<typeof homes[number]>("UPDATE houses_owned SET character_id=$1,permits='[]' WHERE character_id=$2 RETURNING house_id,price",[wp.charId,lp.charId])).rows;
        cars=(await q.query<typeof cars[number]>('UPDATE cars_owned SET character_id=$1 WHERE character_id=$2 RETURNING id,car_id',[wp.charId,lp.charId])).rows;
      },
      committed:()=>{
        const result:CasinoResult={id:i.id,game:'duelo',stake:0,payout:prize,text:'Has ganado el duelo',opponent:lp.name,houses:homes.length,cars:cars.length};
        wp.money=balance;
        for(const h of homes)this.world.property.inheritHouse(wp,h.house_id,Number(h.price));
        for(const v of cars)wp.cars.push({id:v.id,car:v.car_id});
        this.world.send(winner,{t:'sheet',sheet:buildSheet(this.world.c,wp)});
        void this.send(winner,i.table,undefined,result,true);
        void this.send(loser,i.table,undefined,{...result,payout:0,text:'Has perdido el duelo',opponent:wp.name},true);
      },
    });
  }
}
function finishBlackjack(hand:Hand):CasinoResult {
  const player=blackjackValue(hand.player), natural=player===21&&hand.player.length===2;
  const dealerNatural=blackjackValue(hand.dealer)===21&&hand.dealer.length===2;
  if(!natural&&!dealerNatural&&player<=21)while(blackjackValue(hand.dealer)<17)hand.dealer.push(hand.deck.shift()!);
  const dealer=blackjackValue(hand.dealer);
  const tie=player<=21&&(natural===dealerNatural)&&player===dealer;
  const won=player<=21&&!dealerNatural&&(natural||dealer>21||player>dealer);
  const text=won?(natural?'Blackjack · pago 3 a 2':'Gana tu mano'):tie?'Empate · apuesta devuelta':player>21?'Te pasaste de 21':'Gana la banca';
  return {id:hand.id,game:hand.game,stake:hand.stake,player:hand.player,dealer:hand.dealer,text,payout:won?Math.floor(hand.stake*(natural?2.5:2)):tie?hand.stake:0};
}
