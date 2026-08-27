#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
NODE_RUNNER="$ROOT_DIR/scripts/hr-cutover/full-domain-lifecycle.mjs"
COMMAND="${1:-}"
shift || true
CONFIG=""
RECOVER=""
PREVIOUS=""
for ARG in "$@"; do
  if [ "$PREVIOUS" = "--config" ]; then CONFIG="$ARG"; PREVIOUS=""; continue; fi
  if [ "$ARG" = "--recover" ]; then RECOVER="--recover"; continue; fi
  PREVIOUS="$ARG"
done
[ -n "$COMMAND" ] && [ -n "$CONFIG" ] || { printf 'usage: full-domain-lifecycle.sh <command> --config <file>\n' >&2; exit 2; }

case "$COMMAND" in
  provision|run|rollback) ;;
  cleanup|status) ;;
  *) printf 'unsupported lifecycle command\n' >&2; exit 2 ;;
esac

# Replace the shell so HUP/INT/TERM reach the Node process directly. The Node
# runner owns the append-only signal journal and registry-scoped recovery; a
# competing shell trap could otherwise clean resources while a child survives.
if [ -n "$RECOVER" ]; then
  exec node "$NODE_RUNNER" "$COMMAND" --config "$CONFIG" --recover
fi
exec node "$NODE_RUNNER" "$COMMAND" --config "$CONFIG"
