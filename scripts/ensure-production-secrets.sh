#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  printf "Missing production env file: %s\n" "$ENV_FILE" >&2
  exit 1
fi

current_key="$(
  sed -n 's/^PARTY_DATA_ENCRYPTION_KEY=//p' "$ENV_FILE" |
    tail -n 1
)"

if [ "${#current_key}" -ge 32 ]; then
  printf "Production party-data encryption key is configured.\n"
  exit 0
fi

generated_key="$(openssl rand -hex 32)"
temporary_file="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
trap 'rm -f "$temporary_file"' EXIT INT TERM

awk -v replacement="PARTY_DATA_ENCRYPTION_KEY=$generated_key" '
  BEGIN { replaced = 0 }
  /^PARTY_DATA_ENCRYPTION_KEY=/ {
    if (!replaced) {
      print replacement
      replaced = 1
    }
    next
  }
  { print }
  END {
    if (!replaced) {
      print replacement
    }
  }
' "$ENV_FILE" > "$temporary_file"

chmod 600 "$temporary_file"
mv "$temporary_file" "$ENV_FILE"
trap - EXIT INT TERM

printf "Generated and persisted the production party-data encryption key.\n"
