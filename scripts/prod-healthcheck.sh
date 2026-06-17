#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
MODE="${MODE:-liveness}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

API_PORT="${API_PUBLISHED_PORT:-${APP_PORT:-3001}}"
API_HOST="${API_PUBLISHED_HOST:-127.0.0.1}"
case "$API_HOST" in
  "0.0.0.0"|"::")
    API_HEALTH_HOST="127.0.0.1"
    ;;
  *)
    API_HEALTH_HOST="$API_HOST"
    ;;
esac
case "$API_HEALTH_HOST" in
  \[*\])
    API_HEALTH_URL_HOST="$API_HEALTH_HOST"
    ;;
  *:*)
    API_HEALTH_URL_HOST="[$API_HEALTH_HOST]"
    ;;
  *)
    API_HEALTH_URL_HOST="$API_HEALTH_HOST"
    ;;
esac
WEB_PORT_VALUE="${WEB_PUBLISHED_PORT:-${WEB_PORT:-3000}}"
API_HEALTH_URL="${API_HEALTH_URL:-http://$API_HEALTH_URL_HOST:$API_PORT/api/v1/health}"
API_READY_URL="${API_READY_URL:-http://$API_HEALTH_URL_HOST:$API_PORT/api/v1/ready}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1:$WEB_PORT_VALUE/login}"

fetch_url() {
  url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url" >/dev/null
  else
    node -e "fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$url"
  fi
}

check_url() {
  label="$1"
  url="$2"
  if fetch_url "$url"; then
    printf "%s OK: %s\n" "$label" "$url"
    return 0
  fi
  printf "%s FAIL: %s\n" "$label" "$url" >&2
  return 1
}

printf "Running production healthcheck in MODE=%s\n" "$MODE"

case "$MODE" in
  liveness)
    if ! check_url "API liveness" "$API_HEALTH_URL"; then
      printf "LIVENESS FAIL\n" >&2
      exit 1
    fi
    ;;
  readiness)
    if ! check_url "API readiness" "$API_READY_URL"; then
      printf "READINESS FAIL\n" >&2
      exit 1
    fi
    ;;
  full)
    if ! check_url "API liveness" "$API_HEALTH_URL"; then
      printf "FULL CHECK FAIL\n" >&2
      exit 1
    fi
    if ! check_url "API readiness" "$API_READY_URL"; then
      printf "FULL CHECK FAIL\n" >&2
      exit 1
    fi
    if ! check_url "WEB login" "$WEB_HEALTH_URL"; then
      printf "FULL CHECK FAIL\n" >&2
      exit 1
    fi
    ;;
  *)
    printf "Unknown MODE: %s\n" "$MODE" >&2
    printf "Supported MODE values: liveness, readiness, full\n" >&2
    exit 1
    ;;
esac
