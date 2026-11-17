# Vértice · novedades de la v0.10: sigilo

La idea: ir en sigilo siempre es una buena opción, sobre todo en lugares llenos de enemigos. Como en los juegos de infiltración, los PNJ **solo saben lo que ven y lo que oyen**.

## 1. Ruleta de armas (R) y armas a la vista

- **`R` abre la ruleta.** Muestra las armas que llevas encima, las integradas en el cromo (por ejemplo, el dedo pistola) y **Manos vacías**.
  - Se elige con el ratón: apuntas hacia el arma.
  - Puedes mantener `R` y soltar sobre el arma, o pulsar y hacer clic. `Esc` la cierra.
  - Cada arma dice cuánto ruido hace («se oye a ~34 m», «silenciosa: ~3 m») o si es cromo («el detector no la ve»).
- **Las armas que llevas encima se ven:**
  - Fusiles: cruzados a la espalda, con correa.
  - Katanas y armas blancas largas: a la espalda, con la empuñadura sobre el hombro.
  - Pistolas y cuchillos: en la cadera, con funda.
- Llevarlas a la vista **alerta en los lugares vigilados y restringidos**. Para entrar en sigilo, lo mejor es no llevar nada (o solo cromo).

## 2. El hackeo pasa a `Q`

Otras teclas que cambian:

| Acción | Tecla nueva | Antes |
|---|---|---|
| Hackeo | `Q` | `R` |
| Ruleta de armas | `R` | — |
| Patada | `F` | `Q` |
| Panel del cuerpo | `H` | `F` |
| Facciones | `Ñ` | `H` |

Si habías cambiado tus teclas a mano, se respetan.

## 3. Ver y oír

- **Vista:** cada PNJ mira hacia un lado, con un cono de 140°. Te ve hasta a 15 m de día, 10 m de noche y 12 m en interiores, si nada le tapa (los edificios cortan la línea de visión).
  - En los callejones ven un 40 % menos.
  - Cada punto de Sigilo reduce un 4 % más la distancia a la que te ven.
  - A menos de 2,2 m te ven siempre.
- **Oído:** cada arma se oye a una distancia: 8 m + 32 m según lo ruidosa que sea.
  - Las silenciosas, a un 30 % de esa distancia.
  - Los golpes cuerpo a cuerpo, a unos 2–4 m.
  - Al disparar se ve un anillo con el radio del ruido.
  - Los agentes que lo oyen pero no te ven **van a investigar**; los demás giran la cabeza.
- **Sin testigos no hay delito.** Si matas o derribas a alguien y nadie lo ve ni lo oye (ni lo graba una cámara), no te buscan: «🤫 Nadie te ha visto ni oído».
  - La propia víctima no cuenta como testigo.
  - Solo llaman a la policía los civiles que lo han presenciado.
- **La policía y las bandas solo te atacan si te ven.** En la base de una banda, si no te ven, puedes moverte.

## 4. Sospecha, descripción y caras

- **Medidor de sospecha** (0–100 %). Sube mientras alguien que vigila te ve haciendo algo sospechoso:
  - llevar un arma empuñada;
  - llevar armas a la vista en zonas seguras o restringidas;
  - estar en un lugar restringido sin el uniforme adecuado;
  - cargar un cuerpo;
  - encajar con la descripción de los testigos;
  - que te reconozcan la cara.

  Baja cuando nadie te ve.
- **Primero avisan.** Si solo es por llevar el arma en la mano, la primera vez el agente te da el alto («¡Eh, usted! ¡Baje el arma y guárdela!»). Si sigues, va a por ti.
- **Descubierto** (100 %):
  - Van a por ti quienes te vigilan y, en un lugar restringido, todos sus guardias.
  - Si no te buscaban, pasas a nivel 1 de búsqueda.
- **Descripción.** Los testigos que te ven cometer un delito recuerdan tu ropa durante 10 minutos.
  - Si te cambias de ropa, los agentes dejan de reconocerte.
  - Uno que ya te persigue no te suelta hasta que le pierdas de vista.
- **Caras.** De cerca (menos de 3 m) te reconocen igualmente, salvo que lleves la cara tapada: máscara, máscara de gas, bandana, máscara de demonio, casco o casco de moto.
  - Si las cámaras te identificaron, los agentes te reconocen a menos de 4 m.

## 5. Disfraces

| Uniforme | Dónde encaja | Armas por el detector |
|---|---|---|
| **Uniforme de la PCV** | Comisarías, el penal y el banco | Sí: puedes pasar armado. Un agente que se te acerque mucho puede notar que no eres de los suyos. |
| **Uniforme de seguridad privada** | Banco, torres corporativas y laboratorios | Solo en el banco. |
| **Bata de laboratorio** | Torres corporativas y laboratorios | No. |

Cómo se consiguen:
- Al **registrar a un agente o guardia caído** te llevas su uniforme: el de la PCV, el de seguridad o la bata, según dónde estaba.
- La bata y el de seguridad también los vende el perista; la bata, además, la tienda de segunda mano.

## 6. Lugares restringidos y arcos detectores

- **40 lugares restringidos:**
  - las comisarías;
  - las torres corporativas (el detector está en el vestíbulo);
  - los laboratorios y oficinas corporativas;
  - y dos nuevos, con su puerta y rótulo: el **Banco Central** (en Cénit) y el **Penal de Hierro** (en el Polígono).
- Tienen **guardias**: agentes de la PCV o seguridad privada.
- **El arco detector de la entrada pita si llevas armas encima** y salta la alarma: destello rojo, pitidos y todos los guardias a por ti.
- **No detecta el cromo.** Las armas integradas pasan: el **dedo pistola** es ahora un arma de verdad, silenciosa, que se dispara desde el meñique. También pasan las cuchillas, las garras y los demás implantes de arma.

## 7. Barra de sigilo bajo el minimapa

- **Estado:**
  - ◌ OCULTO
  - 👁 VISTO
  - ⚠ BAJO SOSPECHA
  - 🚨 DESCUBIERTO
  - 🔎 TE BUSCAN
  - ⚔ EN COMBATE
- Debajo, el medidor de sospecha y unas fichas: lugar restringido, disfraz, armas (ninguna, a la vista o empuñada), cara tapada o visible, y si encajas con la descripción.
- **Te buscan:**
  - la PCV (con su nivel);
  - la **Unidad Hierro (militares)** a partir del nivel 4;
  - cada **banda, cartel o corporación que paga por tu cabeza** (con la cantidad), o «Cazarrecompensas» si es una recompensa particular;
  - las bandas que te tienen por enemigo;
  - si tu cara está en los registros de la PCV.
- **Sobre cada PNJ que te está mirando** aparece un ojo que pasa de blanco a amarillo y a rojo, con un arco que se llena con la sospecha.

## Técnico

**Ficheros nuevos**
- Servidor: `server/src/world/stealth.ts`.
- Cliente: `client/src/ui/stealth.ts`.
- Contenido: `scripts/v10.mjs`.

**Protocolo y esquema**
- Mensajes nuevos: `stealth` y `noise`.
- Efecto nuevo `alarm`.
- Las entidades llevan el campo `carry` (armas a la vista).
- Las zonas pueden tener `restricted` y `detector`.

**Combate**
- El ruido de cada disparo y golpe, y los testigos de cada delito, salen del módulo de sigilo.
- Corregido: la propia víctima contaba como testigo.

**Pruebas**
- `server/test/v10.test.ts` (7 pruebas).
- Total: 105 pruebas de servidor y la e2e de dos navegadores en verde.
