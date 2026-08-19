#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SOURCE_DIR="${YUZHOU_SOURCE_DIR:-/Users/mac/Downloads/玉舟人力资源管理系统分析产出}"
POSTGRES_PORT="${POSTGRES_PORT:-15432}"
SQLSERVER_PORT="${YUZHOU_SQLSERVER_PORT:-14333}"
failed=0

pass() { printf 'PASS  %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failed=1; }

need_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$1: $(command -v "$1")"
  else
    fail "missing command: $1"
  fi
}

port_listener() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | sed -n '2p' || true
}

printf '%s\n' 'HR migration runtime diagnostic (read-only)'
for command_name in node pnpm git docker colima psql python3 jq rg openssl shasum 7z; do
  need_command "$command_name"
done

if docker info >/dev/null 2>&1; then
  pass "Docker engine is reachable"
else
  fail "Docker engine is not reachable; start Colima first"
fi

if docker compose version >/dev/null 2>&1; then
  pass "Docker Compose plugin is available"
else
  fail "Docker Compose plugin is unavailable"
fi

if [ -d "$SOURCE_DIR" ]; then
  source_count="$(find "$SOURCE_DIR" -type f | wc -l | tr -d ' ')"
  pass "legacy source directory is readable ($source_count files)"
else
  warn "legacy source directory is absent: $SOURCE_DIR"
fi

for port_pair in "PostgreSQL:$POSTGRES_PORT" "SQLServer:$SQLSERVER_PORT"; do
  service="${port_pair%%:*}"
  port="${port_pair##*:}"
  listener="$(port_listener "$port")"
  if [ -n "$listener" ]; then
    warn "$service lab port $port is already in use: $listener"
  else
    pass "$service lab port $port is available"
  fi
done

free_kb="$(df -Pk "$ROOT_DIR" | awk 'NR==2 { print $4 }')"
if [ "$free_kb" -ge 20971520 ]; then
  pass "workspace disk free space is at least 20 GiB"
else
  fail "workspace disk free space is below 20 GiB"
fi

if docker compose -f "$ROOT_DIR/infra/docker/docker-compose.yml" config --quiet; then
  pass "PostgreSQL Compose configuration is valid"
else
  fail "PostgreSQL Compose configuration is invalid"
fi

if [ -n "${YUZHOU_SQLSERVER_SA_PASSWORD:-}" ]; then
  if docker compose -f "$ROOT_DIR/infra/docker/docker-compose.yuzhou-migration.yml" config --quiet; then
    pass "SQL Server migration Compose configuration is valid"
  else
    fail "SQL Server migration Compose configuration is invalid"
  fi
else
  warn "YUZHOU_SQLSERVER_SA_PASSWORD is unset; SQL Server config/start check skipped"
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
