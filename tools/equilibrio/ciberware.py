"""v0.38 · Equilibrio del ciberware.

Da a cada implante una puntuación de poder (1 punto ≈ 1 nivel de habilidad) y la acerca a la que le toca por su rareza y
gama, sin tocar su idea: se escalan sus propios efectos, se ajustan capacidad, humanidad y precio a la franja de su rareza
y se separan los implantes repetidos dándoles un efecto secundario propio de su hueco. Los Kairós y los míticos únicos
quedan fuera (los míticos, a propósito, por encima de todo). Escribe content/cyberware.json, content/cyberware/opticas.json y
docs/EQUILIBRIO_CIBERWARE.md con el antes y el después.  Uso: python3 tools/equilibrio/ciberware.py (parte siempre del contenido de la v0.37 en git)
"""
import json, re, statistics, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
FILES = [ROOT / 'content/cyberware.json', ROOT / 'content/cyberware/opticas.json']
W = {'hpMax': .12, 'armor': 1.5, 'carry': .12, 'ram': .25, 'meleeDmg': 12, 'speed': 30, 'confront': .8, 'surgery': 25,
     'dodge': 30, 'steal': .7, 'carSpeed': 8, 'crit': 25, 'regen': 4, 'ramPlus': 1, 'ramSave': 15}
INTS = {'hpMax', 'armor', 'carry', 'ram', 'confront', 'steal', 'ramPlus'}
BUDGET = {('comun', 1): 2.6, ('poco-comun', 1): 3.2, ('poco-comun', 2): 3.8, ('raro', 2): 5.2, ('epico', 3): 7.8, ('legendario', 4): 11, ('legendario', 5): 13.5}
CAP = {'comun': (1, 3), 'poco-comun': (2, 3), 'raro': (2, 4), 'epico': (3, 6), 'legendario': (5, 10)}
HUM = {'comun': (0, 1), 'poco-comun': (1, 2), 'raro': (1, 3), 'epico': (2, 5), 'legendario': (4, 8)}
PRICE = {'comun': (250, 1100), 'poco-comun': (1200, 3500), 'raro': (2500, 6500), 'epico': (8000, 18000), 'legendario': (25000, 60000)}
# Efecto secundario propio de cada hueco, para separar implantes que hacían exactamente lo mismo.
SECOND = {'ojos': ('skills', 'investigacion', 1), 'oidos': ('skills', 'percepcion', 1), 'pierna': ('dodge', None, .03), 'piernas': ('dodge', None, .03),
          'brazo': ('carry', None, 5), 'proyector': ('skills', 'actuacion', 1), 'cortex': ('ramSave', None, .05), 'columna': ('hpMax', None, 8)}
ALT = {'oidos': ('skills', 'sigilo', 1), 'ojos': ('skills', 'armas', 1), 'pierna': ('speed', None, .02), 'piernas': ('speed', None, .02), 'brazo': ('confront', None, 1)}
NAMES = {'INT': 'INT', 'REF': 'REF', 'DEX': 'DEX', 'TECH': 'TECH', 'COOL': 'COOL', 'WILL': 'WILL', 'LUCK': 'LUCK', 'MOVE': 'MOVE', 'BODY': 'BODY', 'EMP': 'EMP'}
SKILLS = {s['id']: s['name'] for s in json.load(open(ROOT / 'content/skills.json'))}

def score(c):
    e = c.get('effects', {}); s = 0.0
    s += 3 * sum(e.get('attrs', {}).values()) + sum(e.get('skills', {}).values())
    for k, w in W.items(): s += w * (e.get(k) or 0)
    n = e.get('needs')
    if n: s += sum(10 * (1 - v) for v in n.values())
    # La visión se mide sobre la de un ojo sin ayuda (16 losetas, 140°).
    if e.get('sight'): s += max(0, e['sight']['range'] - 16) / 5 + max(0, e['sight']['degrees'] - 140) / 60
    return s
def fixed(c):
    # Lo que no es una cifra (arma integrada, habilidad activa, pasiva, efecto único) vale una parte del presupuesto de su rareza.
    b = budget(c)
    return (0.6 * b if (c.get('effects') or {}).get('weapon') else 0) + (0.55 * b if c.get('ability') else 0) + (0.45 * b if c.get('passive') else 0) + (0.7 * b if c.get('unique') else 0)
def budget(c):
    return BUDGET.get((c['rarity'], c['grade']), BUDGET.get((c['rarity'], 4), 5))

def scale(c, k):
    e = c['effects']
    for key in ('attrs', 'skills'):
        for a, v in list(e.get(key, {}).items()):
            if v: e[key][a] = max(1, round(v * k))
    for key in W:
        v = e.get(key)
        if not v: continue
        if key in INTS: e[key] = max(1, round(v * k))
        else: e[key] = round(max(0.01, v * k), 2)

def summary(e):
    out = []
    for a, v in e.get('attrs', {}).items():
        if v: out.append(f'+{v} {NAMES.get(a, a)}')
    for a, v in e.get('skills', {}).items():
        if v: out.append(f'+{v} {SKILLS.get(a, a)}')
    p = lambda x: f'{round(x * 100)} %'
    if e.get('hpMax'): out.append(f"+{e['hpMax']} salud")
    if e.get('armor'): out.append(f"blindaje {e['armor']}")
    if e.get('carry'): out.append(f"+{e['carry']} kg de carga")
    if e.get('ram'): out.append(f"{e['ram']} RAM")
    if e.get('ramPlus'): out.append(f"+{e['ramPlus']} RAM máxima")
    if e.get('ramSave'): out.append(f"−{p(e['ramSave'])} de gasto de RAM")
    if e.get('meleeDmg'): out.append(f"+{p(e['meleeDmg'])} de daño cuerpo a cuerpo")
    if e.get('speed'): out.append(f"+{p(e['speed'])} de velocidad")
    if e.get('dodge'): out.append(f"+{p(e['dodge'])} de esquiva")
    if e.get('crit'): out.append(f"+{p(e['crit'])} de crítico")
    if e.get('confront'): out.append(f"+{e['confront']} en enfrentamientos")
    if e.get('steal'): out.append(f"+{e['steal']} al robar")
    if e.get('surgery'): out.append(f"+{p(e['surgery'])} de supervivencia en quirófano")
    if e.get('carSpeed'): out.append(f"+{p(e['carSpeed'])} de velocidad al volante")
    if e.get('regen'): out.append(f"+{e['regen']} salud por segundo")
    if e.get('sight'): out.append(f"visión de {e['sight']['range']} losetas en {e['sight']['degrees']}°")
    return ', '.join(out)

def redesc(c):
    # Se conserva la parte narrativa (las frases sin cifras) y se reescribe el resumen con los números nuevos.
    keep = []
    for sen in re.split(r'(?<=[.!?])\s+', c['desc']):
        if not re.search(r'\d', sen): keep.append(sen)
        elif ':' in sen and not re.search(r'\d', sen.split(':')[0]): keep.append(sen.split(':')[0].strip() + '.')
    text = ' '.join(keep).strip() or c['family'] + '.'
    sm = summary(c['effects'])
    c['desc'] = f'{text} {sm[0].upper() + sm[1:]}.' if sm else text

def clean(e):
    for k in list(e):
        v = e[k]
        if isinstance(v, dict):
            for kk in list(v):
                if not v[kk]: del v[kk]
            if not v and k in ('attrs', 'skills'): del e[k]
        elif v == 0: del e[k]

rows = []
# Siempre parte del ciberware de la v0.37 (sin equilibrar), sacado de git: así se puede volver a ejecutar sin escalar dos veces.
BASE = 'fae2fe3'
for path in FILES:
    data = json.loads(subprocess.check_output(['git', 'show', f'{BASE}:{path.relative_to(ROOT).as_posix()}'], cwd=ROOT))
    seen = {}
    for c in data:
        if c.get('rarity') == 'mitico' or (c.get('ability') or {}).get('kind') == 'kairos' or c['id'] == 'zocalo-matrices' or c['id'].startswith('penal-'):
            b0 = round(score(c) + fixed(c), 1)
            if c.get('rarity') == 'mitico' and c['id'] == 'kairos-6':
                # Mítico único: roto a propósito. Más que cualquier Kairós comprable en todo.
                c['effects'].update({'attrs': {'REF': 4, 'MOVE': 2}, 'hpMax': 45, 'ram': 22, 'speed': 0.24, 'dodge': 0.16, 'crit': 0.12, 'regen': 1})
                c['capacity'] = 22; c['humanity'] = 16
            rows.append((c['id'], c['rarity'], b0, round(score(c) + fixed(c), 1), 'mítico único: roto a propósito' if c.get('rarity') == 'mitico' else 'sin cambios (Kairós o base)'))
            continue
        c.setdefault('effects', {})
        before = score(c) + fixed(c)
        target = budget(c)
        notes = []
        ce = json.loads(json.dumps(c['effects'])); clean(ce)
        sig = (c['slot'], c['rarity'], json.dumps(ce, sort_keys=True), (c.get('ability') or {}).get('kind'), c.get('passive'))
        if sig in seen and c['slot'] in SECOND:
            key, sub, val = SECOND[c['slot']]
            if sub: c['effects'].setdefault(key, {}); c['effects'][key][sub] = c['effects'][key].get(sub, 0) + val
            else: c['effects'][key] = round((c['effects'].get(key) or 0) + val, 2)
            notes.append(f'separado de {seen[sig]}')
        seen.setdefault(sig, c['id'])
        # Lo que solo se puede ajustar en enteros (atributos sueltos) y se pasa mucho de su rareza sube de rareza.
        UP = {'comun': ('raro', 2), 'poco-comun': ('raro', 2), 'raro': ('epico', 3), 'epico': ('legendario', 4)}
        ints_only = all(isinstance(v, dict) or k in INTS for k, v in c['effects'].items() if v)
        if score(c) + fixed(c) > budget(c) * 1.6 and c['rarity'] in UP and ints_only and sum(c['effects'].get('attrs', {}).values()) >= 2:
            notes.append(f"rareza {c['rarity']}→{UP[c['rarity']][0]}"); c['rarity'], c['grade'] = UP[c['rarity']]; target = budget(c)
        s = score(c)
        want = max(target * 0.5, target - fixed(c))
        changed = False
        if s > 0 and (s > want * 1.3 or s < want * 0.75):
            k = min(2.5, max(0.5, want / s))
            scale(c, k); changed = True; notes.append(f'efectos ×{k:.2f}')
        clean(c['effects'])
        lo, hi = CAP[c['rarity']]; cap = min(hi, max(lo, c['capacity']))
        if c.get('prosthetic'): cap = max(cap, c['capacity'] if c['capacity'] <= hi + 2 else hi + 2)
        if cap != c['capacity']: notes.append(f'capacidad {c["capacity"]}→{cap}'); c['capacity'] = cap
        lo, hi = HUM[c['rarity']]; hum = min(hi, max(lo, c['humanity']))
        if hum != c['humanity']: notes.append(f'humanidad {c["humanity"]}→{hum}'); c['humanity'] = hum
        lo, hi = PRICE[c['rarity']]
        after = score(c) + fixed(c)
        # El precio sale del valor real dentro de su rareza: lo justo (≈ presupuesto) cae a media escala, y lo que se pasa o
        # se queda corto sube o baja (escala geométrica entre el mínimo y el máximo de la rareza).
        t = min(1.0, max(0.0, (after / budget(c) - 0.6) / 0.8))
        price = int(round(lo * (hi / lo) ** t / 50) * 50)
        if price != c['price']: notes.append(f'precio {c["price"]}→{price}'); c['price'] = price
        if changed or any(n.startswith('separado') for n in notes): redesc(c)
        rows.append((c['id'], c['rarity'], round(before, 1), round(after, 1), ', '.join(notes) or '—'))
    # Segunda pasada: tras escalar, dos implantes del mismo hueco pueden haber vuelto a quedar iguales. Al segundo se le da otro
    # efecto propio de su hueco.
    final = {}
    for c in data:
        if c.get('rarity') == 'mitico' or c.get('ability') or c.get('unique') or c.get('passive'): continue
        sig = (c['slot'], json.dumps(c['effects'], sort_keys=True))
        if sig in final:
            key, sub, val = ALT.get(c['slot'], ('hpMax', None, 5))
            if sub: c['effects'].setdefault(key, {}); c['effects'][key][sub] = c['effects'][key].get(sub, 0) + val
            else: c['effects'][key] = round((c['effects'].get(key) or 0) + val, 2)
            redesc(c)
            for i, r in enumerate(rows):
                if r[0] == c['id']: rows[i] = (*r[:4], (r[4] if r[4] != '—' else '') + f' · distinto de {final[sig]}')
            sig = (c['slot'], json.dumps(c['effects'], sort_keys=True))
        final[sig] = c['id']
    json.dump(data, open(path, 'w'), ensure_ascii=False, indent=1 if path.name == 'cyberware.json' else 1)
    open(path, 'a').write('\n')

order = ['comun', 'poco-comun', 'raro', 'epico', 'legendario', 'mitico']
def spread(vals): return f'{min(vals):.1f}–{max(vals):.1f} (mediana {statistics.median(vals):.1f})' if vals else '—'
md = ['# Equilibrio del ciberware (v0.38)', '',
      'Puntuación de poder de cada implante: 1 punto ≈ 1 nivel de habilidad (un atributo vale 3; 15 de salud, 1,8; 5 % de esquiva, 1,5…). Un arma integrada vale el 60 % del presupuesto de su rareza; una habilidad activa, el 55 %; una pasiva especial, el 45 %; un efecto único, el 70 %. Se genera con `python3 tools/equilibrio/ciberware.py`.', '',
      '| Rareza | Objetivo | Antes | Después |', '|---|---|---|---|']
for r in order:
    b = [x[2] for x in rows if x[1] == r and 'sin cambios' not in x[4]]; a = [x[3] for x in rows if x[1] == r and 'sin cambios' not in x[4]]
    tgt = {'comun': '2,6', 'poco-comun': '3,2–3,8', 'raro': '5,2', 'epico': '7,8', 'legendario': '11–13,5', 'mitico': 'sin límite'}[r]
    md.append(f'| {r} | {tgt} | {spread(b)} | {spread(a)} |')
md += ['', '| Implante | Rareza | Antes | Después | Cambios |', '|---|---|---:|---:|---|']
md += [f'| {i} | {r} | {b} | {a} | {n} |' for i, r, b, a, n in sorted(rows, key=lambda x: (order.index(x[1]), x[0]))]
(ROOT / 'docs/EQUILIBRIO_CIBERWARE.md').write_text('\n'.join(md) + '\n')
print('\n'.join(md[:12]))
print(sum(1 for x in rows if x[4] != '—'), 'implantes ajustados de', len(rows))
