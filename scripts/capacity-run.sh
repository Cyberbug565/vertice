#!/usr/bin/env bash
# Pruebas de capacidad de la alfa: concentración (40 bots + 60 PNJ, 20 min) y carga repartida (100 bots, 60 min).
# Requiere PostgreSQL (DATABASE_URL en .env) o usa PGlite. El generador debería ejecutarse en otra máquina (BASE=...).
set -euo pipefail
cd "$(dirname "$0")/.."
CROWD_MIN=${CROWD_MIN:-20}
SPREAD_MIN=${SPREAD_MIN:-60}
start_server() {
  pkill -f "server/src/main.ts" 2>/dev/null || true; sleep 1.5
  (env AUTH_RATE_LIMIT=100000 "$@" npx tsx server/src/main.ts > loadtest-results/server-$(date +%s).log 2>&1 &)
  for i in $(seq 1 30); do curl -sf localhost:${PORT:-8080}/healthz >/dev/null && return 0; sleep 1; done
  echo "el servidor no arrancó" >&2; exit 1
}
mkdir -p loadtest-results
start_server AMBIENT_NPCS=24 CROWD_NPCS=60
npm run loadtest -- --scenario crowd --bots 40 --duration $((CROWD_MIN * 60)) --warmup 30
start_server AMBIENT_NPCS=24 CROWD_NPCS=0
npm run loadtest -- --scenario spread --bots 100 --duration $((SPREAD_MIN * 60)) --warmup 30
pkill -f "server/src/main.ts" || true
