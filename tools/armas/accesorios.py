"""v0.44 · Genera content/items/accesorios.json (accesorios de armas) y sube el precio de las armas.

Clases: P pistola, S subfusil, F fusil, T tirador, E escopeta, A ametralladora, N energía.
Cambios: dmg/rate/noise en proporción, range en losetas, acc en puntos, weight en kg.
Uso: python3 tools/armas/accesorios.py   (los precios de las armas solo se suben una vez: si ya están, no se tocan)
"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
C = {'P': 'pistola', 'S': 'subfusil', 'F': 'fusil', 'T': 'tirador', 'E': 'escopeta', 'A': 'ametralladora', 'N': 'energia'}
# id, nombre, hueco, clases, cambios, precio, peso, legal, descripción, mira (aumento, retícula)
A = [
 ('mira-hierro-tritio', 'Miras de tritio Nocturna', 'mira', 'PSFEAT', {'acc': 1}, 450, 0.02, True, 'Alza y punto de mira con insertos de tritio que brillan en la oscuridad. Sin aumento: lo justo para alinear.', (1.1, 'hierro')),
 ('mira-holo-12', 'Holográfico Halo 1,2×', 'mira', 'PSFEAN', {'acc': 1, 'range': 1}, 1800, 0.15, True, 'Retícula holográfica de punto y círculo con un leve aumento. Se apunta con los dos ojos abiertos.', (1.2, 'holo')),
 ('mira-holo-14', 'Holográfico Vanguardia 1,4×', 'mira', 'SFEAN', {'acc': 2, 'range': 2}, 3200, 0.3, True, 'Holográfico de doble anillo con algo más de aumento para media distancia.', (1.4, 'holo-anillo')),
 ('mira-recortada-4x', 'Óptica recortada Corsario 4×', 'mira', 'FTAN', {'acc': 2, 'range': 5}, 7400, 0.5, True, 'Visor compacto de 4 aumentos con retícula en chevrón iluminado. Para fusiles que tiran lejos.', (4, 'tactica')),
 ('mira-francotirador-8x', 'Visor de francotirador Vigía 8×', 'mira', 'T', {'acc': 3, 'range': 9}, 16500, 0.9, True, 'Visor de 8 aumentos con retícula de puntos de corrección. Solo para armas de tirador.', (8, 'francotirador')),
 ('silenciador-susurro-9', 'Silenciador Susurro-9', 'boca', 'PS', {'noise': -0.75, 'range': -1, 'dmg': -0.04}, 2600, 0.2, False, 'Supresor roscado para 9 mm y .45. El disparo pasa de trueno a palmada.', None),
 ('silenciador-monolito', 'Silenciador monolítico Mudo-45', 'boca', 'S', {'noise': -0.8, 'range': -1, 'dmg': -0.02}, 3400, 0.35, False, 'Tubo integral que envuelve el cañón entero del subfusil. Lo más silencioso que se fabrica.', None),
 ('supresor-tormenta', 'Supresor Tormenta-556', 'boca', 'FA', {'noise': -0.7, 'range': -2}, 4800, 0.45, False, 'Supresor de titanio para calibres de fusil. Se calienta, pero calla.', None),
 ('supresor-sombra', 'Supresor de tirador Sombra', 'boca', 'T', {'noise': -0.65, 'range': -2, 'dmg': -0.03}, 7900, 0.5, False, 'Supresor largo para rifles de precisión: nadie sabe de dónde vino el disparo.', None),
 ('compensador-corvo', 'Compensador Corvo', 'boca', 'P', {'acc': 1, 'noise': 0.1}, 900, 0.08, True, 'Ranuras que desvían el gas hacia arriba: la pistola apenas levanta la boca.', None),
 ('compensador-tripuerto', 'Compensador de tres puertos', 'boca', 'SF', {'acc': 2, 'noise': 0.1}, 1600, 0.15, True, 'Tres salidas de gas por lado que sujetan la ráfaga.', None),
 ('freno-muralla', 'Freno de boca Muralla', 'boca', 'FTA', {'acc': 1, 'rate': -0.05, 'noise': 0.15}, 2100, 0.25, True, 'Freno de boca agresivo: menos retroceso, más estruendo y fogonazo.', None),
 ('estrangulador-completo', 'Estrangulador completo', 'boca', 'E', {'range': 2, 'acc': 1}, 1100, 0.1, True, 'Choke cerrado: los perdigones viajan juntos más lejos.', None),
 ('boca-de-pato', 'Boca de pato Ancha', 'boca', 'E', {'range': -1, 'dmg': 0.08}, 950, 0.1, True, 'Abre los perdigones en abanico horizontal. Para pasillos y portales.', None),
 ('bobina-enfoque', 'Bobina de enfoque Lente Fría', 'boca', 'N', {'range': 3, 'acc': 1}, 5200, 0.2, True, 'Anillos magnéticos que concentran el haz o el proyectil de energía.', None),
 ('canon-competicion', 'Cañón de competición Galgo', 'canon', 'P', {'range': 2, 'acc': 1}, 1400, 0.2, True, 'Cañón ajustado de tiro deportivo, con contrapeso.', None),
 ('canon-largo-magnum', 'Cañón largo Magnum de 6"', 'canon', 'P', {'dmg': 0.1, 'range': 2, 'rate': 0.08}, 2200, 0.35, True, 'Cañón largo de revólver de caza: más velocidad de salida, más pesado de mover.', None),
 ('canon-comando', 'Cañón corto Comando', 'canon', 'SF', {'range': -2, 'rate': -0.06, 'weight': -0.3}, 1300, 0.0, True, 'Cañón recortado para interiores: el arma se mueve como un cuchillo.', None),
 ('canon-pesado-arquero', 'Cañón pesado Arquero de 20"', 'canon', 'FT', {'range': 4, 'dmg': 0.06, 'rate': 0.05}, 3900, 0.6, True, 'Cañón largo y grueso que no se calienta. Alcance y pegada a cambio de peso.', None),
 ('canon-estriado-hielo', 'Cañón estriado de precisión Hielo', 'canon', 'T', {'range': 5, 'acc': 2}, 8800, 0.5, True, 'Estriado forjado en frío y flotante: la bala va donde apuntas.', None),
 ('canon-recortado-ratonero', 'Cañón recortado Ratonero', 'canon', 'E', {'range': -2, 'dmg': 0.05, 'weight': -0.6}, 700, 0.0, False, 'Escopeta serrada: cabe bajo el abrigo y es ilegal en toda la ciudad.', None),
 ('canon-yunque', 'Cañón de servicio pesado Yunque', 'canon', 'A', {'range': 3, 'dmg': 0.05}, 5600, 1.2, True, 'Cañón de recambio de ametralladora pesada, con disipador de aletas.', None),
 ('cachas-vibora', 'Cachas de goma Víbora', 'empunadura', 'P', {'acc': 1}, 350, 0.05, True, 'Cachas de goma con textura de escama. No resbala ni con sangre.', None),
 ('agarre-vertical-explorador', 'Agarre vertical Explorador', 'empunadura', 'SFA', {'acc': 1, 'rate': -0.03}, 800, 0.15, True, 'Empuñadura delantera recta para dominar la ráfaga.', None),
 ('agarre-angulado-bisel', 'Agarre angulado Bisel', 'empunadura', 'SF', {'acc': 1, 'weight': -0.05}, 950, 0.1, True, 'Agarre inclinado que deja el arma lista para apuntar antes.', None),
 ('bipode-titan', 'Bípode Titán', 'empunadura', 'AT', {'acc': 3}, 2400, 0.6, True, 'Patas plegables para tirar tumbado o apoyado. Precisión de banco de pruebas.', None),
 ('corredera-pulgar', 'Corredera táctica Pulgar', 'empunadura', 'E', {'rate': -0.1, 'acc': 1}, 1200, 0.15, True, 'Corredera con tope para el pulgar: se recarga el bombeo sin pensar.', None),
 ('culata-plegable-zorro', 'Culata plegable Zorro', 'culata', 'SF', {'weight': -0.4, 'acc': -1}, 1000, 0.0, True, 'Se pliega de lado: el arma cabe en una bolsa de deporte.', None),
 ('kit-sin-culata-correcaminos', 'Kit sin culata Correcaminos', 'culata', 'S', {'weight': -0.8, 'acc': -2}, 600, 0.0, True, 'Fuera culata: ligerísimo y saltarín.', None),
 ('culata-tactica-bastion', 'Culata táctica ajustable Bastión', 'culata', 'SFA', {'acc': 1}, 1500, 0.2, True, 'Culata de seis posiciones con apoyo de mejilla.', None),
 ('culata-mejilla-paciente', 'Culata de mejilla Tirador Paciente', 'culata', 'T', {'acc': 2}, 3100, 0.4, True, 'Culata regulable en altura y largo para esperar horas en la misma postura.', None),
 ('culata-pistola-maton', 'Culata de pistola Matón', 'culata', 'E', {'weight': -0.7, 'acc': -1}, 750, 0.0, True, 'Empuñadura de pistola en lugar de culata: se dispara desde la cadera.', None),
 ('culata-acolchada-cero', 'Culata acolchada Retroceso Cero', 'culata', 'EA', {'acc': 1, 'rate': -0.03}, 1400, 0.3, True, 'Cantonera de gel que se come el culatazo.', None),
 ('culatin-llavero', 'Culatín de pistola Llavero', 'culata', 'P', {'acc': 2}, 1700, 0.3, False, 'Culata desmontable para pistola. La convierte en una carabina de bolsillo; ilegal.', None),
 ('cargador-extendido-17', 'Cargador extendido 17+5', 'cargador', 'P', {'rate': -0.06}, 700, 0.1, True, 'Cinco balas más en la empuñadura: se recarga menos.', None),
 ('cargador-gemelo', 'Cargador de cambio rápido Gemelo', 'cargador', 'PSF', {'rate': -0.08}, 1300, 0.1, True, 'Dos cargadores unidos por una pinza: cambio en medio segundo.', None),
 ('tambor-panal', 'Tambor de 50 Panal', 'cargador', 'S', {'rate': -0.12}, 2600, 0.6, False, 'Cargador de tambor para subfusil. Ilegal: es para no soltar el gatillo.', None),
 ('cargador-larga-jornada', 'Cargador de 45 Larga Jornada', 'cargador', 'F', {'rate': -0.08}, 2100, 0.35, False, 'Cargador de gran capacidad para fusil. Prohibido fuera del ejército.', None),
 ('tambor-diluvio', 'Tambor de 100 Diluvio', 'cargador', 'A', {'rate': -0.15}, 4300, 1.4, False, 'Cien cartuchos en un tambor doble. Para cuando no hay prisa por recargar.', None),
 ('tubo-hambre', 'Tubo extendido de 8 Hambre', 'cargador', 'E', {'rate': -0.1}, 1000, 0.3, True, 'Depósito tubular largo: tres cartuchos más.', None),
 ('municion-siseo', 'Cargador de subsónica Siseo', 'cargador', 'PSFT', {'noise': -0.3, 'dmg': -0.08, 'range': -2}, 1800, 0.0, False, 'Munición más lenta que el sonido: el disparo se oye mucho menos y pega menos.', None),
 ('municion-punta-negra', 'Cargador perforante Punta Negra', 'cargador', 'PFTA', {'dmg': 0.12, 'rate': 0.04}, 3600, 0.0, False, 'Balas con núcleo de tungsteno que atraviesan chalecos. Ilegales para civiles.', None),
 ('celula-ascua', 'Célula de sobrecarga Ascua', 'cargador', 'N', {'dmg': 0.15, 'rate': 0.1, 'noise': 0.1}, 6200, 0.2, False, 'Célula de energía trucada: más potencia por disparo, más tiempo de recarga.', None),
 ('disipador-glaciar', 'Disipador térmico Glaciar', 'cargador', 'N', {'rate': -0.15}, 4400, 0.3, True, 'Aletas de grafeno: el arma de energía enfría antes y dispara más seguido.', None),
 ('laser-rubi', 'Láser táctico Rubí', 'tactico', 'PSFE', {'acc': 1}, 1100, 0.08, True, 'Puntero láser rojo visible: lo ves tú y lo ve el otro.', None),
 ('linterna-faro', 'Linterna táctica Faro 900', 'tactico', 'PSFEA', {'range': 1}, 650, 0.12, True, 'Linterna de 900 lúmenes que ciega a corta distancia.', None),
 ('laser-fantasma', 'Láser infrarrojo Fantasma', 'tactico', 'SFTA', {'acc': 2}, 3800, 0.1, False, 'Láser invisible a simple vista. Solo lo ve tu ciberóptica (y quien tenga una).', None),
 ('telemetro-agrimensor', 'Telémetro balístico Agrimensor', 'tactico', 'FT', {'range': 3, 'acc': 1}, 4600, 0.25, True, 'Mide la distancia y corrige la caída de la bala en la retícula.', None),
 ('modulo-ojo-halcon', 'Módulo de puntería Ojo de Halcón', 'tactico', 'PSN', {'acc': 2}, 5400, 0.1, True, 'Enlace inteligente arma-ciberóptica: la retícula sigue al blanco.', None),
]
def rarity(p): return 'comun' if p < 1000 else 'poco-comun' if p < 2500 else 'raro' if p < 5000 else 'epico' if p < 10000 else 'legendario'
out = []
for (i, name, slot, cl, mods, price, w, legal, desc, sight) in A:
    att = {'slot': slot, 'classes': [C[k] for k in cl], 'mods': mods, 'legal': legal}
    if sight: att['sight'] = {'zoom': sight[0], 'reticle': sight[1]}
    out.append({'id': i, 'name': name, 'desc': desc, 'weight': max(0.02, w), 'price': price, 'category': 'accesorio', 'rarity': rarity(price), 'attachment': att})
dst = ROOT / 'content/items/accesorios.json'
json.dump(out, open(dst, 'w'), ensure_ascii=False, indent=1); open(dst, 'a').write('\n')
print(len(out), 'accesorios')

# Armas más caras (sobre todo las mejores). Marca para no aplicarlo dos veces.
mark = ROOT / 'tools/armas/.precios-v044'
if not mark.exists():
    for f in [ROOT / 'content/items.json', ROOT / 'content/items/armas.json']:
        raw = open(f).read(); d = json.loads(raw); lst = d if isinstance(d, list) else d['items']
        for it in lst:
            w = it.get('weapon'); p = it.get('price')
            if not w or not p: continue
            k = (2 + p / 1500) if w['kind'] == 'ranged' else (1.6 + p / 2500)
            it['price'] = int(round(p * k / 10) * 10)
        indent = 1 if raw.startswith('[\n {') or raw.startswith('{\n "') else 2
        json.dump(d, open(f, 'w'), ensure_ascii=False, indent=indent); open(f, 'a').write('\n')
    mark.write_text('hecho\n')
    print('precios de armas subidos')
