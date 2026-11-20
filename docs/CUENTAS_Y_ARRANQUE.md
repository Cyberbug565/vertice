# Cuentas persistentes, expedientes y arranque local · v0.23

## Iniciar en local

En Windows, doble clic en **`iniciar-local.bat`**. En macOS, ejecuta `bash iniciar-local.command`. Desde una terminal en cualquier sistema:

```sh
npm run local
```

Necesitas Node.js 22.12 o posterior. El lanzador instala las dependencias cuando faltan, compila la versión actual, inicia el mismo servidor HTTP y WebSocket que se publica y abre `http://127.0.0.1:8080`. No necesita `cloudflared`. Mantén abierta la ventana; Ctrl+C guarda y cierra. Para no abrir el navegador automáticamente: `npm run local -- --no-open`.

Los guardados locales de prueba se conservan en **`data/local/pglite`**. Cerrar el programa, cambiar de navegador o reiniciar el ordenador no borra esas cuentas. El formulario de acceso indica **MODO LOCAL**. Las cuentas de publicación se mantienen aparte: no se copian ni se sustituyen automáticamente con las de prueba.

## Publicar

Se conservan **`publicar.bat`**, `publicar.command` y `npm run publicar`. El modo público usa el guardado existente **`data/pglite`**, o `DATABASE_URL` cuando está configurada. El lanzador ahora compila siempre, comprueba la salud de la base de datos y del servidor, y destaca el enlace público actual. También guarda el último enlace en `data/publicacion.json` junto con si el proceso sigue en marcha.

Un túnel rápido de Cloudflare da una dirección temporal: al cerrar `cloudflared` deja de funcionar y al volver a publicar cambia el nombre. Consulta la [documentación oficial de Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Actualizar GitHub no mantiene encendido el ordenador ni reinicia un servidor externo.

Si no puedes acceder:

1. Arranca el modo deseado y espera al mensaje **Vértice listo**.
2. Prueba la dirección local que muestra la ventana. `/healthz` debe devolver `ok: true` y `service: "vertice"`.
3. Para acceso público, usa el **ENLACE PÚBLICO NUEVO** que imprime la ventana, y mantenla abierta.
4. Si el puerto está ocupado, cierra la otra instancia o cambia `LOCAL_PORT` / `PORT` en `.env`. No se reutiliza silenciosamente otro servidor.
5. Si falla PostgreSQL, corrige la conexión configurada. El programa no cambia a una base vacía para ocultar el fallo.

## Cuentas y personajes

Después de acceder aparece **Tus personajes**. Puedes continuar cualquiera de los personajes vivos o crear uno nuevo sin borrar los anteriores. La cuenta recuerda la última selección. Solo se controla un personaje de esa cuenta a la vez; abrir otra sesión cambia el control y guarda el personaje anterior. **Esc → Mis personajes** vuelve al selector manteniendo el acceso a la cuenta. **Cerrar sesión** vuelve al formulario de acceso.

La selección y las vidas se guardan en la base de datos del servidor. El navegador conserva únicamente el token de sesión. Un enlace nuevo de Cloudflare puede pedir otro login, pero recuperará las mismas vidas si el servidor sigue usando la misma base de datos.

La migración `011_cuentas_expedientes.sql` es automática al iniciar, conserva las cuentas y los personajes existentes y elimina la limitación anterior de una sola vida activa por cuenta. No se borra ni se reinicia la base.

## Expediente y memorial

Dentro del juego: **C → Ficha → Expediente**; también se abre en el menú sobre tu propio personaje. Desde el selector, usa **Ver expediente**. Se actualiza automáticamente cada cinco segundos mientras está abierto.

La ficha incluye oficio actual, puesto fijo o turno activo, nivel, origen, dinero, tiempo jugado y tiempo de vida, asesinatos de jugadores y PNJ con sus nombres, droga vendida por producto, facturación, ingresos y gastos, trabajos y nóminas, encargos, entregas a bandas, ciberware adquirido, habilidades, reputación, inventario, ropa y propiedades.

Las bajas cuentan al morir definitivamente; un KO no cuenta. Las ventas se registran dentro de la transacción económica y sus reintentos no suman otra venta. El historial de implantes permanece aunque se vendan o cambien de dueño. El dinero inicial no se cuenta como dinero ganado. El tiempo de vida incluye las horas desconectado; el tiempo jugado cuenta la presencia en el mundo, incluido el breve periodo de desconexión en una zona peligrosa.

Al morir se congela una copia del expediente **antes** de liberar viviendas, vehículos, empleo y ciberware. Esa vida aparece en **Memorial → Ver vida completa** y ya no puede seleccionarse para jugar. Las otras vidas de la cuenta continúan disponibles.

Los ingresos y trabajos antiguos se reconstruyen desde sus registros existentes, y se recuperan las ventas antiguas que guardaban cantidades verificables. No es posible reconstruir nombres de víctimas ni ventas que versiones anteriores nunca registraron. El expediente indica desde cuándo existe su registro detallado; los memoriales anteriores mantienen la información que realmente había guardada.

## Servidor final: Cloudflare o alojamiento propio

El código de cuentas, simulación, reglas y protocolo es el mismo en local y en publicación. El cliente usa API y WebSocket del mismo origen, con `wss` en HTTPS. Cloudflare Tunnel funciona delante del servidor Node; en un servidor alquilado, sirve ese mismo proceso detrás de un túnel permanente o un proxy HTTPS que admita WebSocket.

Para alojarlo sin el lanzador de escritorio:

```sh
npm ci
npm run build
npm start
```

Configura `DATABASE_URL` con PostgreSQL persistente o `PGLITE_DIR` con una ruta en disco persistente. El Dockerfile declara `/app/data` como volumen; conserva o monta ese volumen entre actualizaciones. Para desarrollo con PostgreSQL separado usa `LOCAL_DATABASE_URL`; el modo local no hereda automáticamente `DATABASE_URL` de producción. Los puertos se controlan con `LOCAL_PORT` y `PORT`, respectivamente.

Una carpeta nueva con una base vacía es un mundo nuevo: para migrar de equipo hay que conservar la base. No copies una carpeta PGlite mientras esté abierta. Mantén una sola instancia del proceso de juego por ciudad, porque la simulación del mundo reside en memoria; añadir réplicas sin repartir autoridades de mundo produciría sesiones inconsistentes. Este servidor Node no es un paquete de Cloudflare Workers.

## Verificación

Las pruebas de `server/test/accounts-records.test.ts`, `account-migration.test.ts` y `launch-config.test.ts` cubren conservación en disco tras reinicio y nuevo login, varias vidas, selección, aislamiento entre cuentas, reconexión inmediata, cambio de sesión, muerte definitiva, congelación del memorial, registro de ventas e implantes, migración de una cuenta anterior y rechazo de puertos ocupados.

Resultados de la versión comprobada: **253 pruebas correctas en 29 archivos**, `npm run typecheck` correcto y `npm run build -w client` correcto (solo el aviso de tamaño de paquete que ya existía). La prueba del lanzador ha creado una cuenta y personaje mediante HTTP, conectado por WebSocket, cambiado la postura, cerrado con código 0 y reabierto la misma base en disco: se han conservado la identidad y la postura. No se ha usado Cloudflare en esa prueba.

El lanzador local se ha ejecutado realmente, compilado el cliente y arrancado PGlite con las migraciones. Las comprobaciones automatizadas hablan por HTTP y WebSocket reales. La vista local del navegador de este entorno está bloqueada por su política de acceso, por lo que esta entrega no presenta capturas nuevas de la interfaz ni afirma que se haya probado visualmente una partida. Tampoco se ha verificado un servidor público concreto: para diagnosticar ese despliegue hace falta su enlace actual o el mensaje de error de su ventana.
