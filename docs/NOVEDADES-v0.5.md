# Novedades de la v0.5 · «Una sola ciudad»

En esta versión toda Ciudad Vértice es un único mapa, más grande. Los días duran 1 h 30 min, hay trabajos con horario, se puede correr y existe un modo automático que juega por ti.

## 1. Correr

- Se activa con **Mayús** o con el botón **👟 Correr**.
- Vas un 65 % más rápido y gastas aguante. Cuando te quedas sin aliento, vuelves a andar hasta recuperarlo.
- Correr entrena **Atletismo** el doble que andar.

## 2. Modo automático (tecla A o botón 🤖)

La IA controla a tu personaje según la **personalidad** que elijas:

| Personalidad | Cómo vive |
| --- | --- |
| 🧑‍💼 Responsable | Cumple su horario, duerme en sitio seguro y solo acepta trabajos legales y tranquilos |
| 💰 Ambicioso/a | Busca los encargos mejor pagados aunque tengan riesgo |
| 🔥 Temerario/a | Acepta trabajos ilegales, se pelea y algún robo cae de noche. Gana más… o acaba mal (búsqueda, policía, heridas) |
| 🌿 Tranquilo/a | Trabaja lo justo, descansa mucho y pasea |

En automático, tu personaje hace esto por su cuenta:

- come y bebe;
- duerme (en su casa si tiene una, o busca un refugio);
- va a su **puesto fijo** en su horario;
- acepta **encargos de su oficio**;
- asume los riesgos propios de cada trabajo.

Cualquier orden tuya (moverte, hablar, atacar…) le devuelve el control.

> Por ahora el modo automático solo funciona mientras tienes el juego abierto.

## 3 y 6. Ciclo de día y noche de 1 h 30 min y reloj

- Un día completo de la ciudad dura **90 minutos reales**: cada hora de juego son 3 min 45 s.
- La luz cambia: **amanecer** anaranjado, **día** claro, **atardecer** violeta y **noche** azul, con farolas, neones y ventanas encendidos.
- El reloj del HUD muestra la hora y la fase del día.
- Si tienes un puesto fijo, el HUD también muestra:
  - tu **turno** y cuánto falta para que empiece o acabe;
  - el botón **Trabajar turno** cuando estás en horario.

## 4. Puestos de trabajo fijos: farmacias, comisarías, obras y torres

Hay **57 puestos** con horario. Para conseguir uno, vas al sitio y preguntas:

| Sitio | A quién preguntas | Puestos |
| --- | --- | --- |
| 6 farmacias | La encargada | Farmacéutico/a (Medicina 8), dependiente/a (Negociación 4) |
| 4 comisarías nuevas (Ferro, Neón Rojo, El Arrabal y Colinas) | El sargento | Patrulla (Armas 8), detective (Investigación 10), calabozos de noche (Intimidación 6) |
| 6 obras | La caseta de obra | Peón (Atletismo 4), gruista (Conducción 8), jefe/a de obra (Reparación 12) |
| 5 torres corporativas | — | Analista, vigilante nocturno y recepcionista |

- **Requisitos**: un nivel mínimo en la habilidad relacionada, y que **nadie ocupe ya el puesto**. Cada persona puede tener un solo puesto.
- Trabajas tu turno en tu horario y cobras por cada turno. Se gana más con más nivel en la habilidad.

## 5. Ciudad más grande, callejones, pasarelas y luces

- **Todo se ha agrandado un 33 %**: calles, manzanas y edificios. Los edificios son además más altos.
- **Las personas se ven más pequeñas** y los objetos del decorado más grandes, para que la escala sea real:
  - farolas altas con brazo y cono de luz;
  - coches de 2 losetas;
  - contenedores, bancos y cajas más grandes.
- **Callejones oscuros**: los edificios anchos se parten con callejones de 2 losetas.
  - No tienen farolas y son **zona disputada**.
  - Son peligrosos de noche.
- **Pasarelas elevadas (segundo nivel)**: túneles acristalados que cruzan la avenida principal de un edificio a otro.
  - Se sube por las «Escaleras a la pasarela elevada».
  - Dentro se ve la ciudad por los ventanales.
- **Más luz**: farolas a lo largo de todas las calzadas, tiras de neón en las fachadas y avenidas de circunvalación iluminadas.

## 7. Torres corporativas y bases de bandas y narcos

### Torres corporativas

**5 torres de 5 a 8 plantas** a las que se sube por ascensor:

| Torre | Distrito |
| --- | --- |
| Torre Halcón Dynamics | Cénit |
| Aguja Teselia | Cénit |
| Torre Okami | Colinas Doradas |
| Arcología Kaiten | Colinas Doradas |
| Torre Aurora | Forja |

El acceso depende de la planta:

| Plantas | Quién entra |
| --- | --- |
| **Públicas** | Todo el mundo |
| **Solo personal** | Quien tiene un puesto en la corporación o buena relación con ella (+10) |
| **Restringidas** | Armería, laboratorios, servidores, planta ejecutiva y azotea. Exigen mucha confianza (+40) |

- Las plantas restringidas también se pueden alcanzar **hackeando el ascensor**:
  - Si el hackeo sale bien, subes, pero la seguridad de esa planta te trata como intruso.
  - Si sale mal, salta la alarma y sube tu nivel de búsqueda.

### Bases de bandas y narcos

- **5 bases** en las zonas abandonadas nuevas:
  - Muelles Viejos: el **Cártel de la Marea**, una facción nueva de narcos.
  - Descampado Norte: los Saqueadores.
  - Polígono Abandonado: Hojas Rojas.
  - El Vertedero: los Chatarreros.
  - Cementerio de Trenes: Los Engranajes.
- Dentro, la banda ataca a quien no sea de los suyos.
- El **alijo** solo se puede saquear con todos los guardias fuera de combate. Da un botín grande, y tu relación con la banda se desploma.

## 8. Todos los mapas en uno

- Los 7 distritos y las 5 zonas abandonadas forman **una sola ciudad de 608×344 losetas**, unida por **avenidas de circunvalación**.
- Se va andando (o corriendo) de un distrito a otro, sin pantallas de carga. El coche sigue sirviendo para llegar antes.
- **Mapa (M)**:
  - toda la ciudad en un solo plano isométrico;
  - distritos rotulados y tu posición;
  - iconos: 🏢 torres, ☠ bases, ⚕ matasanos descubiertos;
  - botón para ir en coche a otro distrito.
- El servidor solo simula a fondo lo que está **cerca de algún jugador**. El resto de la ciudad queda en reposo, así que el rendimiento se mantiene.

## Teclas nuevas

| Tecla | Acción |
| --- | --- |
| `Mayús` | Correr o andar |
| `A` | Modo automático (elegir personalidad o desactivarlo) |

Los puestos de trabajo se piden haciendo clic en la encargada, el sargento o la caseta de obra. El ascensor de las torres también se usa con un clic.

## Cambios técnicos

- Las posiciones se envían con 1/64 de loseta de precisión y admiten mapas de hasta 1024×1024.
- La búsqueda de caminos ajusta su presupuesto a la distancia.
- Las migraciones de la base de datos se aplican solas al arrancar.
- Los personajes que estaban en la calle de un distrito antiguo reaparecen en el vestíbulo del Bloque 9. Los que estaban dentro de un local siguen allí.
- La duración de la hora de juego se puede cambiar con `CITY_HOUR_MS`; las pruebas automáticas usan 60 s.

## Qué probar

1. Sal del Bloque 9 de día y quédate hasta el atardecer y la noche (unos 30 min) para ver el cambio de luz.
2. Pulsa **M**, elige un distrito lejano y ve andando o corriendo (Mayús).
3. Entra en la farmacia del Canal (cerca del Relé) y pregunta a la encargada si hay trabajo.
4. Ve a la Torre Halcón (Cénit), sube en el ascensor y prueba a hackearlo para llegar a la planta ejecutiva.
5. Activa el modo automático (A) con distintas personalidades y deja que tu personaje viva un rato.
6. Busca un callejón de noche… o los Muelles Viejos, si te atreves.
