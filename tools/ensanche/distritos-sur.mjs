// Ampliación desde la cartografía 0.32. Mantiene la posición de las partidas existentes.
import { readFileSync, writeFileSync } from 'node:fs';
const [source, output] = process.argv.slice(2);
const city = JSON.parse(readFileSync(source, 'utf8'));
if (city.width !== 744 || city.height !== 432) throw Error('Se esperaba el mapa 0.32.');
city.height = 560;
const districts = [
  ['vega', 'La Vega', 'residencial', 12, ['jardin','pabellon','porche','chaflan','voladizo','lucernario']],
  ['alameda', 'Alameda del Sur', 'residencial', 29, ['balcones','patio','galeria','medianera','porche','jardin','lucernario']],
  ['estacion-central', 'Estación Central', 'comercial', 40, ['prisma','bisel','oblicua','terraza','pantalla','pasaje','esquina','galeria']],
  ['astilleros', 'Astilleros de Óxido', 'industrial', 10, ['silos','hangar','darsena','laminador','almacen','deposito']],
  ['barranco-seco', 'Barranco Seco', 'ruina', 3, ['taller-vencido','terminal-rota','nave-hundida','deposito']],
];
const vertical = [[0,8],[74,5],[150,8],[223,6],[300,8],[374,6],[450,8],[525,5],[600,8],[668,6],[707,5],[736,8]];
const horizontal = [[424,8],[468,6],[509,6],[552,8]];
const border = [0,150,300,450,600,736];
const paint = (type, rect, street) => city.ground.push({ type, rect, street });
let block = 0, buildings = 0;
for (const [n,[id,name,facade,ambient,models]] of districts.entries()) {
  const start = border[n]+8, end = border[n+1], rect = [start,432,end-start,120];
  const waypoints = [];
  for (let col = 0; col < vertical.length-1; col++) {
    const left=vertical[col][0]+vertical[col][1], right=vertical[col+1][0];
    if(left<start || right>end) continue;
    for (let row = 0; row < horizontal.length-1; row++) {
      const top=horizontal[row][0]+horizontal[row][1], bottom=horizontal[row+1][0], w=right-left,h=bottom-top;
      const cx=left+Math.floor(w*(block%2?.46:.54)), cy=top+Math.floor(h*(col%2?.54:.46));
      paint('sidewalk',[left,top,w,h]);
      paint(['grass','tile','plaza','metal','sand'][n],[left+2,top+2,w-4,h-4]);
      paint('alley',[cx-1,top,2,h]); paint('alley',[left,cy-1,w,2]);
      waypoints.push([left+1,cy],[cx,top+1],[right-2,cy],[cx,bottom-2]);
      const lots = [[left+4,top+4,cx-left-7,cy-top-7],[cx+3,top+4,right-cx-7,cy-top-7],
                    [left+4,cy+3,cx-left-7,bottom-cy-7],[cx+3,cy+3,right-cx-7,bottom-cy-7]];
      for(const [j,[x,y,lw,lh]] of lots.entries()){
        const key=block*7+j*3;
        if(lw<4 || lh<4 || n===4 && j!==block%4 || n===0 && j===block%4 || n===2 && block%3===1 && j===2) continue;
        const model=models[(block+j)%models.length], height=[3+key%5,7+key%12,12+key%28,4+key%8,2+key%4][n];
        const colors=['#9b8d84','#858b9b','#65758b','#7d736a','#796654'];
        city.buildings.push({id:id+'-'+block+'-'+j,rect:[x,y,Math.max(4,lw-key%3),Math.max(4,lh-(key>>1)%3)],height,
          style:n===2?'tower':n>=3?'industrial':'block',color:colors[n],urban:{model,facade,turn:key%4}});
        buildings++;
      }
      city.props.push({type:'lamp',at:[left+2,top+1],blocking:false});
      city.props.push({type:['plant','bench','busstop','crate','wreck'][n],at:[right-3,bottom-3],blocking:false});
      block++;
    }
  }
  const danger = n===4?'lawless':n===3?'disputed':'public';
  city.districts.push({id,name,rect,ambient,police:n===2?3:n===4?0:1,danger,waypoints,safePoint:waypoints[0],sleepQuality:n<2?.65:.3,gangs:[]});
  city.dangerAreas.push({level:danger,rect});
  city.waypoints.push(...waypoints.filter((_,i)=>i%8===0));
}
for (const [x,w] of vertical) paint('asphalt',[x,432,w,128],'sur-eje-'+x);
for (const [y,h] of horizontal.slice(1)) paint('asphalt',[0,y,744,h],'sur-ronda-'+y);
for(const [x,w] of vertical) for(const [y,h] of horizontal) {
  if(x+w<736 && y!==552) paint('crosswalk',[x+w+3,y,2,h],'sur-ronda-'+y);
  if(y!==552 && x>0 && x<736) paint('crosswalk',[x,y+h+3,w,2],'sur-eje-'+x);
}
// En el primer ensanche solo se pintaron pasos transversales en las vías horizontales.
for(const [x,w] of vertical.slice(1,-1)) {
  const ys=x>=668?[22,88,135,196,248,311,358,401]:[358,401];
  for(const y of ys) paint('crosswalk',[x,y,w,2],'sur-enlace-'+x);
}
const density = {cenit:55,'neon-rojo':46,ferro:38,arrabal:34,colinas:20,'arco-sur':22,'darsena-este':14};
for(const d of city.districts) d.ambient=density[d.id]??d.ambient;
for(let y=13;y<Math.ceil(city.height/32);y++) for(let x=0;x<Math.ceil(city.width/32);x++){
  const d=city.districts.find(({rect:[a,b,w,h]})=>(x+.5)*32>=a && (x+.5)*32<a+w && (y+.5)*32>=b && (y+.5)*32<b+h);
  const existing=city.sectors.find(s=>s.chunk[0]===x && s.chunk[1]===y);
  if(existing){if(d) existing.name=d.name;} else city.sectors.push({chunk:[x,y],name:d?.name??'Ronda del Sur'});
}
writeFileSync(output,JSON.stringify(city,null,1)+'\n');
console.log({block,buildings});
