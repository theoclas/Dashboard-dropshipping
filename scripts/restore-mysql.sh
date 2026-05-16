#!/usr/bin/env bash
# Restaura un dump en MySQL del VPS (docker-compose en la raíz del repo).
# Uso: ./scripts/restore-mysql.sh /tmp/fersua_dashboard_20260216.sql.gz
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DUMP="${1:?Indica la ruta del .sql o .sql.gz}"

if [[ ! -f "$DUMP" ]]; then
  echo "No existe: $DUMP" >&2
  exit 1
fi

docker compose up -d mysql
echo "Esperando MySQL..."
sleep 6

SQL_STREAM=()
if [[ "$DUMP" == *.gz ]]; then
  SQL_STREAM=(gunzip -c "$DUMP")
else
  SQL_STREAM=(cat "$DUMP")
fi

echo "Restaurando en fersua_dashboard..."
"${SQL_STREAM[@]}" | docker compose exec -T mysql mysql \
  -ufersua -pfersua \
  --default-character-set=utf8mb4 \
  fersua_dashboard

echo "Listo. Reinicia el API del back si ya estaba corriendo."
