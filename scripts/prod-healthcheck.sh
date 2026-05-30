#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

API_PORT="${API_PUBLISHED_PORT:-${APP_PORT:-3001}}"
WEB_PORT_VALUE="${WEB_PUBLISHED_PORT:-${WEB_PORT:-3000}}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:$API_PORT/api/v1/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1:$WEB_PORT_VALUE/login}"

check_url() {
  name="$1"
  url="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url" >/dev/null
  else
    node -e "fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$url"
  fi
  printf "%s OK: %s\n" "$name" "$url"
}

check_url "API" "$API_HEALTH_URL"
check_url "WEB" "$WEB_HEALTH_URL"
