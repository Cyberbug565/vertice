# Vértice v0.2 · qué hay de nuevo y qué probar

## Novedades

- **Más futurista y más grande.** Las torres de Ferro miden ahora hasta 34 plantas. Hay arcologías escalonadas, agujas con antena, fachadas de cristal con franjas de luz, pasarelas aéreas, hologramas publicitarios, balizas que parpadean y tráfico aéreo (calidad alta). Por la avenida del este se llega a **Cénit**, el distrito corporativo, con torres de hasta 44 plantas: Okami, Halcón Dynamics, Teselia, Aurora y Kaiten.
- **Eurodólares (€$)** como moneda oficial.
- **Red de mercado.** Cuatro corporaciones fijan el margen de cada categoría: Okami (comida y medicina), Aurora (bebida, ropa y equipo), Halcón (armas y herramientas) y Teselia (ciberware). Cada tienda ajusta el precio según sus existencias: cuando los jugadores compran sube, cuando venden baja, y las tiendas se reponen con el tiempo. Cada 6 horas de juego las corporaciones revisan sus márgenes según la demanda y lo anuncian en el boletín. Puedes consultarlo con la tecla `K` o en las terminales del mercado.
- **Comer, beber y dormir.** Hambre, sed y sueño suben con el tiempo; trabajando, al doble. Si tienes comida, el personaje come y bebe solo. Si no tiene, va solo a la máquina o tienda más cercana y compra. Si no hay dinero, avisa: puedes rebuscar en los contenedores, trabajar, robar en una tienda o aguantar. Con hambre o sed al máximo pierdes salud hasta caer derribado y morir. Puedes apagar la autonomía en la ficha (`C`).
- **Dormir en cualquier sitio** con `Z`. La calidad del descanso depende del lugar:

  | Sitio | Calidad |
  | --- | --- |
  | Tu cubículo del Bloque 9 | 100 % |
  | Cápsulas del Hotel Koi (25 €$) o del Nido (40 €$) | 90–95 % |
  | Interiores protegidos | 60 % |
  | Calle | 35 % |

  En la calle te pueden robar o dar una paliza, tanto los PNJ como otros jugadores. Si el sueño llega a 100, caes rendido donde estés.
- **20 oficios y 100 empleos.** Los oficios con empleador son médico, corpo, merc, técnico, guardia, policía, transportista, cocinero, camarero, periodista, netrunner corporativo, estibador, dependiente, investigador y músico. Los libres son cazarrecompensas, vagabundo, chatarrero y mensajero; el buscavidas es ilegal. Cada oficio tiene su ventaja. Los empleos se abren con `O` o en las bolsas de empleo. Aceptas uno, vas al puesto y tu personaje trabaja solo y cobra. Con los turnos subes de rango.
- **Seis matasanos** con calidad, precio, moral y peligro distintos:

  | Matasanos | Calidad | Perfil |
  | --- | --- | --- |
  | Clínica Okami | ★★★★★ | Carísima |
  | Doc Sato | ★★★★ | Honrada |
  | Dr. Vex | ★★★★ | Depende de tu fama con las Hojas Rojas |
  | Mama Iruka | ★★★ | Acepta cromo robado con recargo |
  | Ruiz | ★★ | Prótesis |
  | El Carnicero | ★★ | Barato, pone cromo robado y puede robarte durante la anestesia |

  Antes de operar ves la peligrosidad, la probabilidad de sobrevivir, la de que salga limpia, el riesgo de robo, el precio y cómo quedarán tu Humanidad y tu capacidad de cromo. **Si mueres en la mesa, pierdes el personaje.** El perista del Pachinko vende y compra cromo robado.
- **Recompensas.** Puedes poner precio (`B`) a cualquier jugador o fugitivo; el dinero queda retenido. Cuatro fugitivos tienen recompensas de la PCV y de corporaciones. Cobrar una recompensa no es delito. Si robas o agredes, sube tu nivel de búsqueda y la PCV acaba poniendo precio a tu cabeza.
- **Personas.** Al hacer clic sobre otro jugador aparece un menú con probabilidades: robar, dar una paliza, cobrar su recompensa o estabilizarlo si está derribado. En zonas protegidas no se puede agredir.
- **Muerte definitiva.** Tras 30 s derribado sin que nadie te estabilice (con un estimulante, o siendo médico o Medtech), el personaje muere. Verás el resumen de su vida y quedará en el memorial. Después puedes crear otro.
- **El Netrunner forma parte del equipo:** su hackeo cuenta como aportación y cobra el encargo completo.

## Qué probar (y contarme)

1. Crea un personaje y elige oficio. Sal a la calle y deja pasar 10–15 minutos: ¿se nota el hambre, la sed y el sueño? ¿Come y compra solo cuando debe?
2. Vacía la cartera y no comas. ¿Te avisa a tiempo? ¿Se entiende por qué mueres?
3. Duerme una vez en la calle de Kanal y otra en tu cubículo del Bloque 9. ¿Compensa el riesgo?
4. Compra varias veces lo mismo en una máquina y mira cómo sube el precio. Abre el mercado (`K`) tras unas horas de juego y lee el boletín.
5. Acepta un empleo de tu oficio y haz un turno. ¿La paga y la duración están bien?
6. Ve a El Carnicero y a la Clínica Okami. Compara precio y supervivencia. ¿Se entienden los riesgos?
7. Con dos navegadores, pon una recompensa al otro personaje y cóbrala en la calle.
8. Captura a un fugitivo, como «Chispas» Lund en los muelles de Ferro.

## Valores que puedes pedirme cambiar

- Ritmo de las necesidades: `content/needs.json`. Ahora mismo el hambre llega a 100 en unas 22 horas de juego, unos 22 minutos reales.
- Precios, márgenes y elasticidad: `content/market.json` e `items.json`.
- Duración del derribo, riesgo de dormir en la calle, empleos, matasanos y fugitivos: todo está en `content/`.
