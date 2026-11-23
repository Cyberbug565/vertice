# Vértice v0.37: 1.006 diálogos nuevos según la zona

**Cada barrio habla a su manera:**
- **Colinas:** pijo y con eufemismos.
- **Cénit:** jerga de empresa, donde despedir es «optimizar».
- **Ferro y la Forja:** de fábrica, con chistes de accidentes laborales.
- **Arrabal y Vertedero:** jerga de calle y humor muy negro.
- **Neón Rojo y la Estación:** consumo, fiesta y resaca.
- **Yermo:** seco y de nómada, con el agua como moneda.

Los interiores tienen sus propias frases: casinos, comisarías, bares y clubes, tiendas, clínicas y farmacias. También se oyen frases junto a los portales y en las calles rojas y negras. Todo con sátira, humor negro y burlas.

## Cómo funciona

Se basa en cómo lo hacen otros juegos: el sistema de respuestas por reglas de Valve (Left 4 Dead 2, TF2), las frases ambientales de GTA V, la multitud de Cyberpunk 2077 y las conversaciones de Hitman. El detalle está en [`DIALOGOS_ZONA.md`](DIALOGOS_ZONA.md).

1. **Secuencia de contextualización.** Antes de hablar, el PNJ mira dónde está (calle o interior, y qué lugar), la clase del barrio, el peligro, la hora y lo que tiene cerca. Si hay un jugador a la vista, también su pinta: ropa cara o harapos, sin camiseta, sangrando, armado, cromado, buscado o su oficio.
2. **Gana la frase más específica.** Lo del sitio pesa más que lo genérico, y lo que se ve del jugador más que la hora. Hay un poco de azar para que no se repita siempre lo mismo.
3. **Memoria por hablante.** Nadie repite tema, escena ni respuesta seguidos.
4. **Secuencias de varias frases.** Dos transeúntes se turnan en conversaciones de dos a cinco frases.
5. **Burlas al jugador.** Al pasar cerca de alguien, tres de cada cuatro veces te suelta lo que su barrio piensa de tu pinta. Un pijo en el Arrabal oye «Bonitos zapatos. Si te los quitas tú, te ahorras el susto». En Colinas, con harapos: «Si viene por la oferta de empleo, la puerta del servicio es la de atrás».
6. **Residentes con horario.** Dentro de su local (casino, comisaría, tiendas…) charlan con las frases del sitio. Si les hablas, a veces te contestan con la burla del lugar.

| Módulo | Diálogos | | Módulo | Diálogos |
|---|---:|---|---|---:|
| Barrios ricos | 125 | | Casinos | 64 |
| Corporativo | 118 | | Sobre tu pinta (cualquier sitio) | 52 |
| Ocio y comercio | 111 | | Comisarías | 46 |
| Marginal | 110 | | Bares y clubes | 43 |
| Obrero | 109 | | Tiendas | 39 |
| Yermo | 89 | | Clínicas y farmacias | 38 |
| | | | Vecinos de portal | 32 |
| | | | Calles peligrosas | 30 |

**Total: 1.006 diálogos (586 escenas con al menos dos respuestas, 211 secuencias y 209 burlas), 3.082 frases.**

## Escribir más

Los diálogos están en `server/voices/zonas/*.voz`, en un formato de texto muy corto: `>` abre una escena, `-` añade una respuesta, `=` es una secuencia con las frases separadas por `|`, `!` es una burla y `{etiquetas}` pone requisitos. Ver [`DIALOGOS_ZONA.md`](DIALOGOS_ZONA.md). `npx tsx scripts/contar-voces.ts` los cuenta y avisa de repeticiones. Los JSON de `server/voices/calle/` de la v0.25 siguen funcionando.

## Técnico

- **Contexto y elección:**
  - `server/src/world/context.ts`: clase de cada barrio, lugar, peligro, hora y pinta del jugador;
  - `server/src/game/voz-format.ts`: lector del formato `.voz`;
  - `server/src/game/voices.ts`: puntuación por especificidad, secuencias y burlas (`taunt`).
- **Dónde se usa:**
  - `street.ts`: charlas con contexto y burlas al pasar;
  - `city-people.ts`: los residentes hablan con las frases de su sitio.
- **Pruebas:** `server/test/v37.test.ts`.
