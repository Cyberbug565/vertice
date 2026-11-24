# Vértice v0.38: inicios, deuda con los Kuro, ciberware equilibrado e Interfaz

## Inicios: de 3 a 11

Cada inicio dice qué ventaja da, cómo de difícil es y dónde empiezas. En la última pantalla del creador se ven el sitio de salida, el equipo y, si lo hay, el aviso del préstamo.

| Inicio | Dificultad | Empiezas en | Lo que trae |
|---|---|---|---|
| Callejero | normal | Bloque 9 | Zona segura y el barrio de tu lado |
| Corporativo | normal | Bloque 9 | Más dinero y contactos con fixers |
| Nómada | normal | Bloque 9 | Motores y carretera |
| **Recién salido del penal** | difícil | Bar La Última Luz | +2 Intimidación y +1 Sigilo. La Hermandad del Sol te debe un favor, pero la PCV te tiene fichado. 40 €$ |
| **Desheredado de Colinas** | fácil | Colinas Doradas | 900 €$, abrigo de sastre y gafas de sol. La calle te mira como a un turista |
| **Becario de Aurora Logística** | normal | Torre Aurora, planta baja | Credencial falsa y Aurora de tu lado |
| **Fugado de un laboratorio** | difícil | Clínica de Sato | +2 Filo, +1 Percepción y +1 Atletismo. Okami te busca (−40). 30 €$ |
| **Músico de Neón Rojo** | normal | Discoteca Circuito | Las Kitsune te aprecian |
| **Rata del Vertedero** | difícil | El Vertedero (zona sin ley) | Herramientas, ganzúa electrónica, máscara de filtro y los Chatarreros contigo |
| **Hijo del Yermo** | normal | El motel del Yermo | Machete, cuatro aguas filtradas, abrigo nómada y los Nómadas del Polvo contigo |
| **Expolicía** | normal | Bar Relé | Táser con 6 cargas y gabardina. La PCV te mira mal (−10) y las Hojas Rojas peor (−20) |

El contenido se valida al arrancar: cada sitio de salida tiene que ser transitable y cada objeto, habilidad y facción tienen que existir.

## Préstamo de los Kuro: 5 puntos de habilidad a cambio de 15.000 €$

El giro vital «deuda» ya no son 2 puntos regalados. Ahora es **un préstamo de 15.000 €$ con los Prestamistas Kuro a cambio de +5 puntos de habilidad al crear el personaje**.

- **Cuota:** 600 €$ cada día de juego (24 horas de ciudad). Solo cuenta el tiempo jugado: desconectado no corre. La primera cuota llega a los dos días.
- **Cobro automático:** si llevas el dinero encima, se cobra sola.
- **Impago:** si no lo llevas, la cuota queda impagada y se suman 300 €$ de recargo.
- **Mercenarios:** con dos impagadas, cuando sales a la calle fuera de una zona verde, los Kuro mandan un equipo a matarte. Cuantas más debas, más mercenarios (hasta 4), de más nivel y mejor armados: pistola, subfusil, escopeta y, al final, rifle de asalto. Se retiran a los 8 minutos o cuando caen.
- **Pagar por adelantado:** desde Personaje → Ficha puedes pagar una cuota o saldarlo todo. Cada cuota pagada borra una impagada y, si bajas de dos, los mercenarios se van.
- **Contabilidad:** todo pasa por el libro contable; el dinero siempre cuadra.

## Ciberware equilibrado

Hay una puntuación de poder para todos los implantes: 1 punto equivale a un nivel de habilidad y un atributo vale 3. Cada implante se acerca a lo que le toca por su rareza y gama:

- **Sin perder su idea:** se escalan sus propios efectos.
- **Capacidad, humanidad y precio:** se ajustan a la franja de su rareza. El precio sale del valor real dentro de esa franja.
- **Repetidos:** los que hacían exactamente lo mismo se diferencian con un efecto propio de su hueco: más investigación en ojos, más sigilo en oídos, más esquiva en piernas…
- **Míticos únicos, rotos a propósito:** muy por encima de cualquier legendario. Kairós Experimental, por ejemplo: +4 Reflejos, +2 Movimiento, +45 de salud, +22 de RAM, más velocidad, esquiva, críticos y regeneración.

**Resultado: se ajustan los 174 implantes (todos cambian al menos de precio).**

Medianas de poder y de precio por rareza:

| Rareza | Poder antes | Poder después | Precio antes | Precio después |
|---|---:|---:|---:|---:|
| Común | 1,5 | 2,0 | 800 | 350 |
| Poco común | 1,5 | 3,0 | 2.200 | 1.550 |
| Raro | 3,0 | 4,9 | 3.600 | 3.850 |
| Épico | 5,0 | 7,5 | 11.000 | 11.600 |
| Legendario | 8,8 | 11,1 | 39.000 | 38.650 |

Antes había comunes que valían más que algunos raros y épicos que no llegaban a raro. La tabla completa, implante por implante, está en [`EQUILIBRIO_CIBERWARE.md`](EQUILIBRIO_CIBERWARE.md). Se regenera con `python3 tools/equilibrio/ciberware.py`.

## La Tormenta se mueve con las animaciones nuevas

La superarmadura usaba la pose antigua de «proxies»: una pose simplificada de brazos y piernas, sin las animaciones capturadas. Ahora el piloto, que va oculto dentro, se anima como cualquier persona:

- **Movimientos:** andar, correr, esquivas, volteretas, golpes, guardia y gestos.
- **Cómo se copia:** la Tormenta copia la rotación de cada hueso en su articulación, con una corrección para que sus brazos (en reposo, caídos) sigan la dirección de los del piloto.
- **Comprobado:** midiendo en el navegador, brazos y piernas de la armadura y del piloto apuntan igual, con una diferencia de 0° a 5°, también al andar.

## Interfaz: lo que ves depende de tu nivel

El implante cruza lo que ves con las bases de datos de la ciudad. Todo se calcula en el servidor, que solo manda lo que tu nivel deja ver: no se puede sacar información de más desde el navegador.

| Interfaz | Capa | De la gente de alrededor (pasando el ratón) | De ti (tu expediente) |
|---|---|---|---|
| 0 | A simple vista | Nombre, si va armado, si sangra | Si la PCV te busca o no |
| 3 | Etiquetas | **Persona real o PNJ**, nivel aproximado, banda | Nivel de búsqueda y precio aproximado por tu cabeza |
| 6 | Perfil | Nivel exacto, oficio, salud, arma, **actitud hacia ti** | Recompensa exacta, la descripción que dieron los testigos y cuánto le dura a la PCV |
| 10 | Antecedentes | Recompensa, antecedentes públicos, cromo instalado | Quién paga por tu cabeza y tus antecedentes |
| 15 | Expediente | Sus tres mejores habilidades, el dinero que lleva, si debe dinero | Quién te está cazando ahora mismo y qué bandas te quieren muerto |
| 20 | Acceso raíz | RAM, humanidad, riesgo de ciberpsicosis y quién puso su recompensa | Borrar la descripción de los testigos de la base de la PCV, una vez por hora |

**Dónde se ve:**
- **Etiqueta al pasar el ratón:** chips de persona o PNJ, nivel y actitud, y debajo los datos.
- **Línea «EXPEDIENTE» bajo la barra de sigilo:** búsqueda, precio por tu cabeza, si tu ropa coincide con la de los testigos, cuánto falta para que la PCV se olvide, cuántos te cazan y las ofertas pendientes.
- **Pestaña Personaje → Interfaz:** el expediente completo, las ofertas y la tabla de capas.

### Difícil de subir y muy buscada

**Por qué cuesta tanto:**
- La experiencia por uso de Interfaz cunde al 45 %.
- Desde el nivel 6, cada punto de habilidad en Interfaz cuesta dos.
- Mirar a gente nueva da un poco de experiencia.

**Ofertas de trabajo de red.** Desde Interfaz 8 llegan al móvil cada cierto tiempo, de bandas, carteles y corporaciones que no te odian.

| Interfaz | Prima al firmar | Sueldo diario |
|---:|---:|---:|
| 8 | 700 €$ | 220 €$ |
| 14 | 2.800 €$ | 880 €$ |
| 20 | 4.900 €$ | 1.540 €$ |

- Las corporaciones pagan un 35 % más y, si ya te aprecian, un 15 % extra.
- El sueldo dura 3 días de juego.
- Firmar sube 12 tu reputación con ellos y baja 6 la de sus rivales.

## HUD más limpio y a tu gusto

**Ajustes → Interfaz en pantalla** tiene 19 casillas para elegir qué se ve: datos de la gente, pistas de controles, línea de ayuda, avisos, experiencia, detalles del personaje, necesidades, panel de salud, arma, habilidades, minimapa, sigilo, barrio y hora, expediente, red y FPS, rótulos de los botones, fila de paneles y los dos chats. Hay botones **Por defecto**, **Mínimo** y **Todo**.

Por defecto vienen apagados:
- la línea de ayuda de controles de abajo;
- las pistas al pasar el ratón;
- los rótulos de los botones de acción, que dejan solo el icono y la tecla;
- los detalles del personaje;
- los datos de red y FPS.

Los controles siguen en Esc → Teclas.

## Pruebas

`server/test/v38.test.ts` comprueba lo siguiente:

**Inicios:**
- hay 11 inicios válidos;
- el expolicía sale en su bar con su táser, sus habilidades y su reputación.

**Préstamo de los Kuro:**
- da 5 puntos y la deuda es de 15.000 €$;
- una cuota impagada pone recargo y con dos impagadas llegan los mercenarios;
- pagar los retira, la cuota se cobra sola y el libro contable cuadra.

**Ciberware:**
- los míticos están por encima del mejor legendario;
- las medianas de precio suben con la rareza;
- no hay implantes idénticos.

**Interfaz:**
- la experiencia cunde menos y los puntos cuestan el doble desde el 6;
- el escáner manda exactamente las capas de cada nivel;
- el expediente por niveles funciona y el borrado de la descripción solo se puede usar una vez por hora;
- las ofertas no llegan antes de 8 y pagan más a más nivel;
- firmar paga y sube la reputación, el sueldo llega un día de juego después y el contrato se guarda.

Se han actualizado las pruebas de implantes y del penal para que lean los valores del contenido, que han cambiado con el equilibrio.

Capturas en `docs/pruebas-038/`.
