"""Dibuja los planos de la documentación a partir de las zonas que usa el servidor."""
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

root=Path('content/zones')
out=Path('docs/pruebas-027')
out.mkdir(parents=True,exist_ok=True)
fontpath='/usr/share/fonts/truetype/dejavu/'
def font(n,bold=False):
    return ImageFont.truetype(fontpath+('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'),n)
def zone(key):
    return json.loads((root/('casino-'+key+'.json')).read_text())
def canvas(title,note,w,h):
    im=Image.new('RGB',(w,h),'#101822')
    d=ImageDraw.Draw(im)
    d.text((44,30),title,font=font(34,True),fill='#f3f1e8')
    d.text((45,80),note,font=font(18),fill='#a0b0bd')
    return im,d
def plan(d,z,x,y,w,h):
    width,height=z['width'],z['height']
    size=min((w-28)/width,(h-58)/height)
    x0=x+(w-width*size)/2;y0=y+45+(h-55-height*size)/2
    def tile(rx,ry,rw,rh):
        return (x0+rx*size,y0+ry*size,x0+(rx+rw)*size,y0+(ry+rh)*size)
    d.rounded_rectangle((x,y,x+w,y+h),radius=14,fill='#15232d',outline='#34434b')
    d.text((x+15,y+13),z['name'],font=font(18,True),fill=z['wallColor'])
    d.rectangle(tile(0,0,width,height),fill='#303941',outline=z['wallColor'])
    d.rectangle(tile(1,1,width-2,height-2),fill='#223239')
    for g in z.get('ground',[]):d.rectangle(tile(*g['rect']),fill='#283e42')
    for b in z.get('blocks',[]):d.rounded_rectangle(tile(*b['rect']),radius=max(1,int(size/4)),fill='#485660')
    for ob in z['props']:
        u,v=ob['at']
        color=ob.get('color','#586574')
        if ob['type']=='neonstrip':d.rectangle(tile(u,v+.43,.9,.13),fill=color)
        elif ob['type'] in ('table','bench','sofa','counter'):d.rounded_rectangle(tile(u,v,.91,.8),radius=max(1,int(size/4)),fill='#50586b')
        elif ob['type'] in ('planter','column','plant'):d.ellipse(tile(u,v,.8,.8),fill='#648b78')
        else:d.rectangle(tile(u+.3,v+.3,.5,.5),fill='#536575')
    for door in z['doors']:
        u,v=door['at']
        d.rectangle(tile(u+.12,v+.12,.76,.76),fill='#6cb7d7')
    for o in z['objects']:
        u,v=o['at']
        d.ellipse(tile(u-.15,v-.15,1.3,1.3),fill='#f4c87e',outline='#fff0d2')
def legend(d,y):
    d.text((45,y),'●  Mesas y terminales',font=font(15,True),fill='#f4c87e')
    d.text((278,y),'■  Accesos',font=font(15,True),fill='#6cb7d7')
    d.text((413,y),'Los planos muestran las mismas losetas, puertas y mesas que usa el juego.',font=font(15),fill='#a0b0bd')

im,d=canvas('Los casinos de Vértice','Tres salas de barrio, Hipódromo Prisma y Gran Meridiano',1200,810)
for i,key in enumerate(('ultima-ficha','bobina','cero-rojo','hipodromo','meridiano')):
    plan(d,zone(key),40+(i%3)*377,122+(i//3)*308,353,287)
legend(d,771)
im.save(out/'casinos.jpg',quality=88)
im,d=canvas('Gran Meridiano','Vestíbulo principal, cuatro salas públicas y La Reserva',1200,810)
for i,key in enumerate(('meridiano','meridiano-ruleta','meridiano-cartas','meridiano-premios','meridiano-pistas','meridiano-vip')):
    plan(d,zone(key),40+(i%3)*377,122+(i//3)*308,353,287)
legend(d,771)
im.save(out/'gran-meridiano.jpg',quality=88)
