"""Genera las plantas originales del Penal de las Salinas."""
import json
from pathlib import Path

root=Path('content/zones')
city_path=root/'vertice.json'
city=json.loads(city_path.read_text())
for key in ('doors','buildings'):
 city[key]=[o for o in city[key] if o['id']!='penal-salinas']
busy=set(tuple(o['at']) for o in city['props']+city['objects']+city['doors'])
for b in city['buildings']+city['blocks']:
 x,y,w,h=b['rect'];busy.update((u,v) for u in range(x,x+w) for v in range(y,y+h))
for a in city['ground']:
 if a['type'] in ('void','water'):
  x,y,w,h=a['rect'];busy.update((u,v) for u in range(x,x+w) for v in range(y,y+h))
def empty(x,y):
 return all((u,v) not in busy for u in range(x-1,x+21) for v in range(y,y+13))
x,y=min(((x,y) for x in range(460,577) for y in range(242,301) if empty(x,y)),key=lambda p:(p[0]-520)**2+(p[1]-302)**2)
entrance=[x+10,y+11]
front=[entrance[0],entrance[1]+1]
def door(id,name,at,to,end,color):
 return dict(id=id,name=name,at=at,to=dict(zone=to,at=end),sign=name,signColor=color)
city['buildings'].append(dict(id='penal-salinas',name='Penal de las Salinas',rect=[x,y,20,11],height=5,style='industrial',color='#384852',sign='PENAL DE LAS SALINAS',signColor='#e4c18c'))
city['doors'].append(door('penal-salinas','Penal de las Salinas',entrance,'penal-visitas',[17,17],'#e4c18c'))
city_path.write_text(json.dumps(city,ensure_ascii=False,indent=1)+'\n')
out={}
def add(key,name,w,h,color,base='metal',safe=None,protected=False):
 z=dict(id='penal-'+key,name=name,kind='interior',width=w,height=h,danger='protected' if protected else 'disputed',base=base,wallColor=color,safePoint=safe or [w//2,h-3],furnished=True,waypoints=[],objects=[],doors=[],props=[],blocks=[],ground=[])
 out[key]=z
 for q in range(4,w-3,6):
  prop(z,'neonstrip',q,2,color)
  prop(z,'column',q,h-5,color,False)
 return z
def prop(z,kind,x,y,color='#5e6877',blocking=False):
 z['props'].append(dict(type=kind,at=[x,y],color=color,blocking=blocking))
def terminal(z,id,name,x,y,model='terminal'):
 z['objects'].append(dict(id=id,name=name,kind='penal',at=[x,y]))
 prop(z,'screen' if model=='terminal' else model,x,y,'#79bdb2')
def link(a,b,ax,bx,label=None,back=None):
 A,B=out[a],out[b]
 col=B['wallColor']
 A['doors'].append(door(A['id']+'-'+b,label or B['name'],ax,B['id'],[bx[0],max(1,min(B['height']-2,bx[1]))],col))
 B['doors'].append(door(B['id']+'-'+a,back or A['name'],bx,A['id'],[ax[0],max(1,min(A['height']-2,ax[1]))],A['wallColor']))
vis=add('visitas','Locutorios y entrada exterior',35,21,'#86a9bc',protected=True)
vis['doors'].append(door('salida-visitantes','Salir al Cementerio', [17,20],'vertice',front,'#8ab0be'))
terminal(vis,'penal-informacion','Información penitenciaria',17,11)
for n in range(5,30,5): prop(vis,'bench',n,6,'#827367',True)
vis['ground'].append(dict(type='tile',rect=[4,7,27,8]))
vis['blocks'].append(dict(type='counter',rect=[6,9,23,1],height=1.1,color='#4e6c7a'))
for x in range(8,29,5):
 prop(vis,'screen',x,8,'#80a6b8')
 prop(vis,'bench',x,11,'#8c817d')
ing=add('ingreso','Ingresos y economato',53,37,'#cea777')
terminal(ing,'penal-expediente','Mesa de expedientes',17,24)
terminal(ing,'penal-economato','Economato y caja judicial',35,24)
terminal(ing,'penal-salida','Control de puesta en libertad',26,29)
for n in range(8,46,7):prop(ing,'locker',n,13,'#986d52',True)
ing['ground'].extend(dict(type='tile',rect=r) for r in ([6,16,41,6],[15,23,23,10]))
for ax in (14,28,41): prop(ing,'desk',ax,25,'#a78972',True)
for ax in (20,32): prop(ing,'neon',ax,15,'#c98858')
link('ingreso','visitas',[26,36],[17,3],'Locutorios y salida','Control de ingresos')
for i,(key,name,color) in enumerate([('patrimonio','Módulo A · Patrimonio','#6cbab7'),('fraude','Módulo B · Fraude','#9a8dd5'),('violencia','Módulo C · Violentos','#c28969'),('alta','Módulo D · Alta Seguridad','#d37480')]):
 z=add(key,name,48,42,color,safe=[23,35])
 link('ingreso',key,[8+i*12,7],[23,41],name,'Distribuidor de ingresos')
 for cy in (6,18,30):
  for cx in (6,16,30,40):
   z['blocks'].extend([dict(type='wall',rect=[cx-2,cy-1,1,7],height=1.4,color='#45515a'),dict(type='wall',rect=[cx-1,cy-1,6,1],height=1.4,color='#45515a'),dict(type='wall',rect=[cx+5,cy-1,1,7],height=1.4,color='#45515a')])
   prop(z,'bed',cx+1,cy+1,'#748797',True)
   prop(z,'locker',cx+4,cy+1,'#576975',True)
   prop(z,'bench',cx,cy+2,'#816e5e')
 z['ground'].extend(dict(type='tile',rect=[cx-1,cy,6,6]) for cy in (6,18,30) for cx in (6,16,30,40))
 for bx in (10,34):prop(z,'lamp',bx,15,color,False)
 terminal(z,'penal-recuento','Registro del módulo',23,10)
 terminal(z,'penal-trato','Banco del pasillo · contacto',24,25,'bench')
p=add('patio-norte','Patio Norte · Cancha y gradas',58,43,'#73bd95','plaza')
z=add('patio-sur','Patio Sur · Muro y huerto',64,42,'#86ac6f','gravel')
for name,zone in [('patio-norte',p),('patio-sur',z)]:
 for j in range(6,zone['width']-5,6): prop(zone,'bench',j,9,'#76785b',True)
 terminal(zone,'penal-trato','Puesto informal en las gradas',19,20,'bench')
def surface(z,ground,rect):
 z.setdefault('ground',[]).append(dict(type=ground,rect=rect))
surface(p,'plaza',[12,12,33,14])
surface(p,'tile',[15,14,26,10])
for rect in ([14,12,1,14],[42,12,1,14],[27,14,1,10]):
 surface(p,'sidewalk',rect)
for x,y in [(9,5),(49,5),(9,22),(46,22),(47,35)]:
 prop(p,'lamp',x,y,'#8dbeb2')
for x in (12,20,29,37,44):prop(p,'bench',x,27,'#657c85',True)
surface(z,'grass',[39,9,19,17])
surface(z,'dirt',[40,11,16,14])
for x in (41,46,51,55):
 for y in (12,17,22):prop(z,'planter',x,y,'#7c986b',True)
for x,y in ((9,10),(34,11),(37,28),(58,26)):prop(z,'lamp',x,y,'#9aae70')
for x,y in ((25,11),(23,16),(11,29)):prop(z,'barrel',x,y,'#8a5f56',True)
link('ingreso','patio-norte',[6,19],[29,42]);link('ingreso','patio-sur',[47,19],[32,41])
link('patio-norte','patio-sur',[50,30],[9,27],'Cruce entre patios')
for k,title,w,h,col,id,label,propname in [
 ('taller','Taller de reparación',38,29,'#deb774','penal-taller','Banco de reparación','desk'),
 ('lavanderia','Lavandería industrial',39,31,'#9aa8ce','penal-lavanderia','Clasificación de lavandería','locker'),
 ('cocina','Cocinas y comedor',46,32,'#d99976','penal-cocina','Servicio de cocina','table'),
 ('servicios','Servicios y muelle de residuos',50,37,'#83b89a','penal-servicios','Puesto de servicios','desk'),
 ('infirmaria','Enfermería del penal',33,22,'#7cc3c8','penal-auxilio','Camilla de enfermería','bed'),
 ('control','Control de seguridad',38,25,'#d07883','penal-control','Panel de salida exterior','screen')]:
 q=add(k,title,w,h,col)
 terminal(q,id,label,w//2,11,propname)
 for j in range(6,w-4,6):
  prop(q,propname,j,5,col,True)
  prop(q,propname,j,h-8,col,True)
link('ingreso','infirmaria',[10,27],[16,21])
link('ingreso','cocina',[43,27],[23,31])
link('patio-norte','taller',[10,31],[19,28])
link('patio-norte','lavanderia',[40,30],[19,30])
link('patio-sur','servicios',[32,30],[25,36])
link('servicios','control',[40,13],[19,24])
for key,rect,material in [
 ('taller',[4,9,30,12],'metal'),('lavanderia',[4,8,31,13],'tile'),('cocina',[5,8,36,17],'tile'),
 ('servicios',[26,11,19,16],'gravel'),('infirmaria',[4,6,25,11],'tile'),('control',[5,7,26,13],'grid')]:
 surface(out[key],material,rect)
for x,y in [(6,18),(8,18),(6,22),(29,22),(37,21),(36,17),(44,25)]:
 prop(out['servicios'],'crate' if x<25 else 'barrel',x,y,'#837859',True)
out['servicios']['blocks'].extend([
 dict(type='barrier',rect=[27,13,10,1],height=.7,color='#687079'),
 dict(type='barrier',rect=[27,28,16,1],height=.7,color='#687079')
])
for x in (8,14,30,36):prop(out['cocina'],'table',x,17,'#a88a6b',True)
for x in (7,13,25,30):prop(out['control'],'screen',x,10,'#bc6873')
terminal(out['cocina'],'penal-racion','Ventanilla de raciones',22,14,'table')
terminal(out['servicios'],'penal-carga','Contenedor de la ruta de las 05:00',33,21,'dumpster')
terminal(out['servicios'],'penal-tunel','Obra clandestina',15,25,'crate')
terminal(out['servicios'],'penal-foso','Los del Foso · trato de herramientas',10,24,'bench')
for key,z in out.items():
 (root/(z['id']+'.json')).write_text(json.dumps(z,ensure_ascii=False,indent=1)+'\n')
print('Entrada y salida',entrance,front,'Interiores',len(out),sum(z['width']*z['height'] for z in out.values()))
# Turnos compartidos por jugadores y NPC. Los perfiles conservan nombres y aspecto entre relevos.
pops=[]
for key,z in out.items():
 if key=='visitas':continue
 for i in range(5 if key in ('alta','patio-norte','patio-sur','control','ingreso') else 3):
  staff=i<2;id='guardia' if staff else 'interno'
  num=len(pops);cx,cy=z['safePoint'];day=6 if i%2==0 else 18
  coord=[[cx+i,cy-3],[cx+i,cy-2],[cx+i,cy-1]]
  dates=[(day,(day+10)%24,'work','Ronda de vigilancia' if staff else 'Pasea por el módulo','brazos'),
   ((day+10)%24,(day+13)%24,'talk','Pausa del turno' if staff else 'Charla en el pasillo','gesto'),
   ((day+13)%24,day,'rest','Vigila el relevo' if staff else 'Descansa en su módulo','sentado')]
  title='Vigilancia de Las Salinas' if staff else ('Engranajes' if num%4==0 else 'Kitsune' if num%4==1 else 'La Salmuera' if num%4==2 else 'Los del Foso')
  name=['Aroa','Vela','Nico','Sol','Vidal','Soto','Juno','Tariq','Nora','Iria','Rui'][num%11]+' '+['León','Cruz','Ríos','Prat','Vidal','Mena','Mir'][num//11]
  pops.append(dict(id=f'penal-{id}-{num}',name=name,title=title,essential=False,appearance=dict(skin=['#875742','#d39b80','#ae7656'][num%3],hair='#29242c',jacket='#263944' if staff else '#b76343',accent=z['wallColor'],top='chaleco' if staff else 'mono',hairStyle=['rapado','coleta','afro','corto'][num%4],body='femenino' if num%2 else 'masculino'),
    resident=dict(job='seguridad' if staff else 'vecino',temper=['seco','metodico','cauto','curioso','cordial'][num%5],speed=2.15 if staff else 1.6,personal=('Al cambiar de turno comprobamos el recuento de cada módulo.' if staff else 'Las alianzas del patio cambian según quién controla el próximo turno.')),
    schedule=[dict(from_=a,to=b,zone=z['id'],at=at,state=s,label=l,pose=p) for (a,b,s,l,p),at in zip(dates,coord)]))
for e in pops:
 for s in e['schedule']:s['from']=s.pop('from_')
 if e['id'].startswith('penal-interno-'):
  titles={'Engranajes':'engranajes','Kitsune':'kitsune','La Salmuera':'salmuera','Los del Foso':'foso'}
  e['faction']=titles[e['title']]
  if e['title']=='La Salmuera': e['resident']['personal']='La Salmuera protege la enfermería. El patio es otra historia.'
  if e['title']=='Los del Foso': e['resident']['personal']='Quien trabaja en servicios suele saber más de lo que cuenta.'
  if e['title']=='Engranajes': e['resident']['personal']='Fuera arreglábamos chatarra en Forja. Aquí ahora arreglamos cuentas.'
  if e['title']=='Kitsune': e['resident']['personal']='La gente de fuera cree que la red acaba en los muros.'
Path('content/npcs/penal.json').write_text(json.dumps(pops,ensure_ascii=False,indent=1)+'\n')
