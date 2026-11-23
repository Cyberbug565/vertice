"""Crea las plantas de casino y añade las fachadas a la ciudad."""
import json
from pathlib import Path

folder=Path('content/zones')
citypath=folder/'vertice.json'
city=json.loads(citypath.read_text())
prefix='casino-'
city['doors']=[row for row in city['doors'] if not row['id'].startswith(prefix)]
city['buildings']=[row for row in city['buildings'] if not row['id'].startswith(prefix)]
original=(city['buildings']+city['blocks'])
busy={(x,y) for b in original for x in range(b['rect'][0],b['rect'][0]+b['rect'][2]) for y in range(b['rect'][1],b['rect'][1]+b['rect'][3])}
busy.update(tuple(v['at']) for v in city['objects']+city['props']+city['doors'])
protected=set(tuple(d['safePoint']) for d in city['districts'])
protected.update(tuple(w) for d in city['districts'] for w in d['waypoints'])
venues=[
 ('ultima-ficha','Última Ficha','ferro','#71dba4',16,12,8,5,4,'loft'),
 ('bobina','La Bobina','muelles-viejos','#ffa46a',18,13,9,6,4,'industrial'),
 ('cero-rojo','Cero Rojo','arrabal','#f47a89',22,15,10,6,5,'club'),
 ('hipodromo','Hipódromo Prisma','poligono','#79dff0',34,22,15,10,8,'club'),
 ('meridiano','Gran Meridiano','descampado-norte','#f4ca81',58,38,25,15,15,'arcology'),
]
labels={'ruleta':'Mesa de ruleta','poker':'Mesa de póker','rasca':'Terminal Rasca y gana','blackjack':'Mesa de blackjack','deportes':'Pantalla de apuestas deportivas','caballos':'Carreras de caballos','duelo':'Mesa reservada'}
games=['ruleta','poker','rasca','blackjack']
def door(id,name,at,to,end,color):
 return {'id':id,'name':name,'at':at,'to':{'zone':to,'at':end},'sign':name,'signColor':color}
def table(z,x,y,g,accent):
 z['objects'].append({'id':z['id']+'-'+g,'kind':'casino','name':labels[g],'games':[g],'at':[x,y]})
 z['props'].append({'type':'screen' if g in ('deportes','caballos') else 'arcade' if g=='rasca' else 'table','at':[x,y],'color':accent,'blocking':False})
 if g in ('ruleta','poker','blackjack','duelo'):
  z['props'].extend({'type':'bench','at':[x+side,y+1],'color':accent,'blocking':False} for side in (-1,1))
def interior(id,name,venue,accent,room,w,h,base):
 z={'id':id,'name':name,'kind':'interior','width':w,'height':h,'danger':'protected','base':base,'wallColor':accent,'safePoint':[w//2,h-3],'waypoints':[],'furnished':True,'casino':{'id':venue,'room':room},'blocks':[],'ground':[],'objects':[],'props':[],'doors':[]}
 for x in range(2,w-2,max(4,w//7)):
  for y in (2,h-3):
   z['props'].append({'type':'neonstrip','at':[x,y],'color':accent,'blocking':False})
 z['ground'].append({'type':'tile','rect':[w//2-1,2,3,h-4]})
 return z
rooms=[]
for v,name,district,accent,w,h,bw,bh,tall,style in venues:
 area=next(d for d in city['districts'] if d['id']==district)
 left,top,aw,ah=area['rect'];cx,cy=area['safePoint']
 def fits(x,y):
  return not any((u,v) in busy or (u,v) in protected for u in range(x-1,x+bw+1) for v in range(y-1,y+bh+3))
 candidates=((x,y) for y in range(top+4,top+ah-bh-4) for x in range(left+3,left+aw-bw-4))
 coords=sorted(candidates,key=lambda p:((p[0]+bw/2-cx)**2+(p[1]+bh-cy)**2,p))
 x,y=next((x,y) for x,y in coords if fits(x,y))
 exterior=[x+bw//2,y+bh]
 id=prefix+v
 city['buildings'].append({'id':id,'name':name,'rect':[x,y,bw,bh],'height':tall,'style':style if style!='loft' else 'shop','color':accent,'sign':name,'signColor':accent})
 city['doors'].append(door(id,name,exterior,id,[w//2,h-3],accent))
 z=interior(id,name,v,accent,'Vestíbulo' if v=='meridiano' else 'Sala de juego',w,h,'wood' if v in ('ultima-ficha','meridiano') else 'metal')
 z['doors'].append(door(id+'-salida','Salir a la calle',[w//2,h-1],'vertice',[exterior[0],exterior[1]+1],accent))
 if v=='meridiano':
  sections=[
   ('ruleta','Salón Órbita','Sala de ruleta','#f7c775',30,22,['ruleta']),
   ('cartas','Galería de Nácar','Mesas de cartas','#c097ef',36,23,['blackjack','poker']),
   ('premios','Jardín de Premios','Rasca y gana','#85e9ba',27,21,['rasca']),
   ('pistas','Tribuna Cenital','Deportes y carreras','#7cdff8',44,26,['deportes','caballos']),
   ('vip','La Reserva','Sala VIP','#d07778',26,19,['duelo']),
  ]
  for i,(key,title,room,c,ww,hh,items) in enumerate(sections):
   sid=id+'-'+key;lobby_at=[8+i*10,4 if key!='vip' else h-10]
   z['doors'].append(door(sid,'Pasillo de servicio' if key=='vip' else title,lobby_at,sid,[ww//2,hh-3],c))
   sub=interior(sid,title,v,c,room,ww,hh,'wood' if key=='vip' else 'metal')
   sub['doors'].append(door(sid+'-vestibulo','Volver al vestíbulo',[ww//2,hh-1],id,[lobby_at[0],lobby_at[1]+1],c))
   for j,g in enumerate(items):
    table(sub,round(ww*(j+1)/(len(items)+1)),7,g,c)
   for xx in (4,ww-5):
    for yy in range(5,hh-4,5):
     sub['props'].append({'type':'column' if key=='vip' else 'planter','at':[xx,yy],'color':c})
   def furnish(kind,positions,color=c,blocking=True):
    sub['props'].extend({'type':kind,'at':[xx,yy],'color':color,'blocking':blocking} for xx,yy in positions)
   if key=='ruleta':
    furnish('sofa',[(7,9),(ww-8,9),(7,13),(ww-8,13)],'#604739')
    furnish('column',[(9,4),(ww-10,4),(9,hh-5),(ww-10,hh-5)])
    furnish('neonstrip',[(x,11) for x in range(10,ww-10,2)],c,False)
   elif key=='cartas':
    furnish('shelf',[(x,3) for x in (6,9,15,21,26,29)],'#695276')
    furnish('sofa',[(x,13) for x in (8,12,23,27)],'#492b61')
    furnish('table',[(10,14),(25,14)],'#8e7297')
   elif key=='premios':
    furnish('arcade',[(x,5) for x in (7,9,ww-10,ww-8)],'#66887a')
    furnish('planter',[(x,y) for x in (7,10,ww-11,ww-8) for y in (11,15)],'#7c9a7f')
    furnish('neon',[(8,4),(ww-9,4)],c,False)
   elif key=='pistas':
    furnish('screen',[(x,3) for x in (10,12,14,29,31,33)],c,False)
    furnish('bench',[(x,yy) for yy in (11,14,17,20) for x in (8,10,12,14,29,31,33,35)],'#28536c')
    furnish('neonstrip',[(x,yy) for yy in (6,22) for x in range(7,ww-6,4)],c,False)
   else:
    furnish('sofa',[(7,6),(18,6),(7,12),(18,12)],'#633745')
    furnish('locker',[(5,3),(20,3)],'#40303f')
    furnish('lamp',[(10,6),(16,6),(10,10),(16,10)],c,False)
   sub['props'].append({'type':'holo','at':[ww//2,3],'color':c,'text':title,'blocking':False})
   rooms.append(sub)
  for xx in (10,18,38,46):
   for yy in (13,21,28):
    z['props'] += [{'type':'sofa','at':[xx,yy],'color':'#5a324c'}, {'type':'plant','at':[xx+1,yy],'color':'#75a07f','blocking':False}]
  for xx in (4,22,34,53):
   z['blocks'].append({'type':'counter','rect':[xx,16,2,4],'height':.7,'color':'#65515a'})
  z['props'].append({'type':'holo','at':[29,11],'text':'GRAN MERIDIANO','color':accent,'blocking':False})
 else:
  choices=games+(['deportes','caballos'] if v=='hipodromo' else [])
  cols=3 if len(choices)==6 else 2
  for i,g in enumerate(choices):
   table(z,round(w*(i%cols+1)/(cols+1)),4+(h//2)*(i//cols),g,accent)
  for y0 in range(3,h-4,4):
   z['props'].append({'type':'screen' if v=='hipodromo' else 'pipe' if v=='bobina' else 'neon','at':[2,y0],'color':accent,'blocking':False})
  z['props'].extend([{'type':'bench','at':[w-3,3],'color':'#444255'}, {'type':'sofa' if v=='hipodromo' else 'trash','at':[w-3,h-4],'color':accent}])
 rooms.append(z)
 print(name,exterior)
for z in rooms:
 (folder/(z['id']+'.json')).write_text(json.dumps(z,ensure_ascii=False,indent=1)+'\n')
citypath.write_text(json.dumps(city,ensure_ascii=False,indent=1)+'\n')
