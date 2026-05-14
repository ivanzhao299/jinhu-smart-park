#!/usr/bin/env sh
set -eu

PNPM_BIN="${PNPM_BIN:-pnpm}"
if ! command -v "$PNPM_BIN" >/dev/null 2>&1 && [ -x ".tools/pnpm" ]; then
  PNPM_BIN=".tools/pnpm"
fi

"$PNPM_BIN" install
"$PNPM_BIN" db:up
"$PNPM_BIN" dev
