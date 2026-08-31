#!/usr/bin/env sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec sh "$ROOT_DIR/scripts/rollback-yuzhou-t5-photo-owner-evidence.sh"
