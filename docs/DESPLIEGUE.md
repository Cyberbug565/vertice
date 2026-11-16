# Publicar Vértice en internet

El juego es **un solo proceso Node** que sirve la web, la API y el WebSocket, más una base de datos **PostgreSQL**. Cualquier plataforma que admita contenedores Docker con WebSocket y conexiones largas sirve.

## Capacidad medida (un proceso)

| Escenario | Tick p95 (presupuesto 25 ms) | Tráfico por jugador |
| --- | --- | --- |
| 100 jugadores repartidos, 60 min | 3,3 ms | 3 KiB/s |
| 40 jugadores + 89 PNJ en el mismo sitio | 2,4 ms | 8 KiB/s |
| 500 jugadores en un solo distrito | 31 ms (cumple p99, no p95) | 11 KiB/s |

**Recomendación:** 2 vCPU y 2–4 GiB de RAM para la alfa (hasta unas 200 personas). Para cientos de jugadores, el siguiente paso es repartir los distritos entre procesos (ver `docs/DISENO.md`).

## Opción 0 · Desde tu ordenador con un túnel gratuito de Cloudflare

Ejecuta `npm run publicar` (o doble clic en `publicar.bat` / `publicar.command`): arranca el servidor y crea un enlace público `https://….trycloudflare.com`. Es gratis y no requiere cuenta. Solo funciona mientras tu ordenador y esa ventana sigan abiertos, el enlace cambia en cada arranque y Cloudflare no garantiza disponibilidad. Para jugar con amigos es ideal; para un mundo permanente, usa una de las opciones siguientes.

## Opción A · Render (la más sencilla, con panel web)

1. Sube el código a un repositorio de GitHub.
2. En https://render.com: **New → Blueprint** y elige el repositorio. Render lee `render.yaml` y crea el servicio web y la base PostgreSQL.
3. En unos minutos tendrás un enlace `https://vertice-xxxx.onrender.com` que abre el juego directamente en el navegador.

El plan `free` sirve para probar, pero se duerme tras 15 minutos sin tráfico y su base de datos caduca. Para jugar en serio usa `starter` (servicio) y `basic` (base de datos), unos 13–20 $/mes.

## Opción B · Fly.io (servidores cerca de España, región `mad`)

```bash
fly launch --copy-config --no-deploy
```
```bash
fly postgres create --name vertice-db --region mad
```
```bash
fly postgres attach vertice-db
```
```bash
fly deploy
```

## Opción C · Servidor propio (VPS): más capacidad por euro

Funciona en cualquier VPS con Docker (por ejemplo, 2 vCPU y 4 GiB por 4–8 €/mes). Caddy obtiene el certificado HTTPS automáticamente.

1. Apunta tu dominio (registro DNS A) a la IP del VPS.
2. En el VPS:
   ```bash
   git clone TU-REPOSITORIO vertice && cd vertice
   ```
   ```bash
   cp deploy/.env.prod.example deploy/.env.prod
   ```
   Edita `deploy/.env.prod`: dominio, contraseña de la base de datos y token de administración.
   ```bash
   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
   ```
3. Abre `https://tu-dominio`.

## Variables de entorno

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL. Las migraciones se aplican solas al arrancar |
| `DATABASE_SSL=true` | Si la base gestionada exige TLS. También vale `?sslmode=require` en la URL |
| `TRUST_PROXY=true` | Usar la IP real del jugador detrás del proxy de la plataforma (límites anti-abuso) |
| `ADMIN_TOKEN` | Acceso a `/api/metrics?token=…` (tick, conexiones, tráfico, memoria) |
| `AMBIENT_NPCS` | Población de transeúntes de Ferro |

`/healthz` responde 200 cuando el servidor está listo; lo usan Render, Fly y Docker. Al detener el proceso (SIGTERM), guarda a todos los personajes antes de salir.

## Verificado

Con la imagen `node:22.12-bookworm-slim` (la misma del `Dockerfile`), el servidor arranca contra PostgreSQL, aplica las migraciones, sirve la web y `/healthz`, y rechaza `/api/metrics` sin token cuando la petición llega a través de un proxy. La compilación completa de la imagen (`npm ci` dentro de Docker) no se pudo ejecutar en el entorno de desarrollo, porque su red no permite descargas desde contenedores. En Render, Fly o un VPS esa descarga es normal.
