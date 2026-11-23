# Diálogos por zona (v0.37)

Cómo decide Vértice qué dice cada PNJ según dónde está, a quién tiene delante y qué hora es; de qué juegos sale la idea, y cómo escribir más frases.

## Cómo lo hacen otros juegos

| Juego o sistema | Cómo elige la frase | Lo que hemos copiado |
|---|---|---|
| **Left 4 Dead 2 / Team Fortress 2** (Valve, el sistema de respuestas que Elan Ruskin explicó en la GDC de 2012) | Cada personaje lanza una consulta con datos del mundo: quién habla, dónde está, qué ve, qué ha pasado. Cada regla pide unos cuantos de esos datos, gana la que más pide de las que se cumplen (la más específica) y una memoria evita repetir. | Etiquetas de contexto, reglas que exigen etiquetas, puntuación por especificidad y memoria por hablante. |
| **GTA V** (frases ambientales) | Cada transeúnte tiene una voz según su tipo (rico, pobre, pandillero, turista…) y unos «contextos»: saludar, quejarse de un empujón, ver un arma… El tipo depende del barrio. | Registro por clase de barrio y reacciones a lo que haces (apuntar, empujar, ir armado). |
| **Cyberpunk 2077** (frases de la multitud) | Las frases sueltas y las escenas de la multitud cambian por distrito y por clase social: lo que se oye en el centro corporativo no es lo que se oye en las afueras. | Barrios corporativos, ricos, obreros, marginales y del desierto con su propio vocabulario. |
| **Hitman** (IOI) | Conversaciones de varias frases entre PNJ que dan contexto del sitio, y comentarios sobre el disfraz o el aspecto del jugador. | Secuencias de varias frases y burlas según la ropa, las heridas o el cromo del jugador. |
| **Watch Dogs: Legion** | Cada PNJ tiene un perfil: oficio, carácter, barrio. | Los residentes con horario hablan con frases del sitio donde trabajan (casino, comisaría, tiendas…). |

**La idea común:** primero se reúne el contexto, luego se busca la regla más concreta que encaja, y la memoria evita que el mismo PNJ repita frase.

## La secuencia de contextualización

Antes de hablar, el PNJ responde a estas preguntas, en este orden (`server/src/world/context.ts`). Cada respuesta es una etiqueta:

| Paso | Pregunta | Etiquetas |
|---|---|---|
| 1 | ¿Dónde estoy? | `exterior` / `interior`; `lugar:casino`, `lugar:bar`, `lugar:club`, `lugar:clinica`, `lugar:farmacia`, `lugar:comisaria`, `lugar:tienda`, `lugar:torre`, `lugar:portal`, `lugar:casa` |
| 2 | ¿Qué barrio y qué clase? | `barrio:<id>`; `clase:alta`, `clase:corpo`, `clase:ocio`, `clase:obrera`, `clase:marginal`, `clase:yermo` (un interior hereda el barrio de su puerta a la calle) |
| 3 | ¿Cómo de peligroso es este punto? | `peligro:protected`, `peligro:public`, `peligro:disputed`, `peligro:lawless` |
| 4 | ¿Qué hora es? | `dia`, `noche`, `madrugada` |
| 5 | ¿Qué hay cerca? | `cerca:bench`, `cerca:busstop`, `cerca:portal`…; `policia:visible`, `cromo:visible`, `arma:potente`; carácter del PNJ |
| 6 | ¿Hay un jugador a la vista? ¿Qué pinta tiene? | `jugador:cerca`; `aspecto:caro` (lleva puesta ropa por valor de 8.000 €$ o más), `aspecto:pobre` (300 €$ o menos, o el torso al aire), `aspecto:desnudo`; `jugador:sangra`, `jugador:armado`, `jugador:cromado`, `jugador:muy-cromado`, `jugador:buscado`, `jugador:conduce`, `jugador:veterano`; `rol:<oficio>` |

Cada barrio tiene su clase:

| Clase | Barrios | Registro |
|---|---|---|
| Alta | Colinas Doradas, La Vega, Alameda del Sur | Pijo, eufemismos («personas en situación de calle», «reajuste»), bienestar de pago, caridad de escaparate |
| Corpo | Cénit y las torres | Jerga de empresa: «optimizar» por despedir, «talento», «sinergia», miedo al jefe |
| Ocio | Neón Rojo, Estación Central, Arco Sur, Terminal Intermodal, Dársena Este, Pasarelas | Fiesta y comercio: influencers, ofertas, resaca, turistas |
| Obrera | Ferro, Forja, Fundición Sur, Astilleros de Óxido, Ronda del Río | De fábrica: turnos, mutua, sindicato, accidentes |
| Marginal | El Arrabal, El Vertedero, Polígono Abandonado, Patio de Vías, Cementerio de Trenes, Polígono Salobre, Muelles Viejos | Calle: «pana», «pavos», «la pasma»; órganos, trapicheo, hambre |
| Yermo | El Yermo, Llanos Orientales, Descampado Norte, Barranco Seco | Nómadas: agua como moneda, polvo, motores, refranes secos |

## Cómo se elige la frase

El motor está en `server/src/game/voices.ts`.

**Puntuación de cada módulo o frase:**

| Requisito | Puntos |
|---|---:|
| Cada etiqueta exigida | 2 |
| Extra si es de clase de barrio | +1,5 |
| Extra si es de lugar | +2,5 |
| Extra si es de la pinta del jugador | +1 |
| Tener alguna etiqueta opcional («?») | +1 |

**Reglas de elección:**
- El 80 % de las veces se elige entre los módulos con más puntos y el 20 % entre todos los que encajan, para que haya variedad.
- **Dentro de un módulo** se reparte al 45 %: las escenas marcadas (de noche, con un pijo delante…) salen a menudo sin acaparar.
- **Prioridades:** una frase del casino gana a una del barrio, una del barrio a una genérica, y una sobre tu herida a una sobre la hora.

**Memoria por hablante.** No repite tema, escena ni respuesta hasta haber usado otras: hasta las últimas 16, o todas menos una si hay menos.

**Dónde se oye cada cosa:**

| Situación | Qué pasa |
|---|---|
| Dos transeúntes se paran a charlar | Escena (pregunta y respuesta) o secuencia de varias frases, turnándose. |
| Pasas cerca de alguien | Tres de cada cuatro veces te suelta lo que el barrio piensa de tu pinta (una burla); si no, el saludo de siempre. |
| Hablas con un residente con horario | A veces te contesta con la burla del sitio. |
| Dos residentes charlan | Usan las frases de su lugar (casino, comisaría, tienda…); en la calle, las del barrio. |

## Lo que hay

**Total: 1.006 diálogos nuevos, con 3.082 frases.**

| Módulo | Dónde | Escenas | Secuencias | Burlas | Diálogos |
|---|---|---:|---:|---:|---:|
| `alta` | Barrios ricos | 69 | 25 | 31 | 125 |
| `corpo` | Cénit y torres | 58 | 27 | 33 | 118 |
| `ocio` | Fiesta y comercio | 56 | 22 | 33 | 111 |
| `marginal` | Barrios marginales | 52 | 24 | 34 | 110 |
| `obrera` | Barrios obreros | 54 | 24 | 31 | 109 |
| `yermo` | Desierto | 41 | 19 | 29 | 89 |
| `casino` | Casinos | 33 | 14 | 17 | 64 |
| `aspecto` | Cualquier sitio, sobre tu pinta | 0 | 0 | 52 | 52 |
| `comisaria` | Comisarías | 20 | 12 | 14 | 46 |
| `nocturno` | Bares y clubes | 21 | 10 | 12 | 43 |
| `tiendas` | Tiendas, súper, armerías | 21 | 8 | 10 | 39 |
| `salud` | Clínicas y farmacias | 17 | 10 | 11 | 38 |
| `vecinos` | Junto a los portales | 16 | 7 | 9 | 32 |
| `peligro` | Calles rojas y negras | 13 | 7 | 10 | 30 |

Cada escena tiene al menos dos respuestas posibles, así que las combinaciones reales son muchas más. `npx tsx scripts/contar-voces.ts` cuenta los diálogos y avisa de las aperturas repetidas.

## Escribir más: el formato `.voz`

Los archivos están en `server/voices/zonas/`. Hay que reiniciar el servidor después de editarlos.

```
id: obrera
requiere: clase:obrera
registro: Obrero de turno, directo y castizo…   (nota para quien escribe)

> ¿Has fichado ya?                              escena: abre uno…
- Dos veces. Una con el dedo y otra con el alma.  …y el otro contesta con una de estas
- Fiché ayer y todavía no me han dejado salir.
> {noche} ¿Vienes del turno de noche?           escena con requisitos propios
- Vengo del turno de siempre.
= ¿Te acuerdas de Ramón? | ¿El de la grúa? | Sí. | ¿Qué le pasó? | La grúa.
                                                secuencia: se turnan los dos hablantes
! {aspecto:caro} Eh, Cénit, ¿te has perdido?    burla al jugador que pasa (según su pinta)
* Huele a fundición y a jornada de doce horas.  comentario suelto
# línea ignorada
```

**Cómo se escriben los requisitos** (entre llaves en una frase, o en la línea `requiere:` del módulo):

| Escribes | Significa |
|---|---|
| `etiqueta` | Tiene que estar |
| `?etiqueta` | Basta con que esté alguna de las marcadas así |
| `!etiqueta` | No puede estar |

Por ejemplo, `{noche ?lugar:bar ?lugar:club !jugador:armado}`. Las frases pueden tener como mucho 170 caracteres, lo que cabe en el bocadillo. Los JSON de `server/voices/calle/` (los de la v0.25) siguen funcionando igual y compiten con los nuevos por puntuación.

## Pruebas

`server/test/v37.test.ts` comprueba lo siguiente:
- que haya al menos 1.000 diálogos, sin aperturas repetidas;
- que todos los barrios tengan su clase;
- que cada clase hable con su registro y que el casino gane al barrio;
- que la burla responda a la pinta del jugador y al barrio;
- que las secuencias se turnen y la memoria no repita;
- que la secuencia de contexto etiquete bien la calle y un interior.
