#!/usr/bin/env sh
set -eu

deploy_path="${1:-${PROD_DEPLOY_PATH:-}}"

if [ -z "$deploy_path" ]; then
  echo "production deploy path is required" >&2
  exit 2
fi

case "$deploy_path" in
  /*) ;;
  *)
    echo "production deploy path must be absolute" >&2
    exit 2
    ;;
esac

normalize_path() {
  if command -v realpath >/dev/null 2>&1 && realpath -m -- / >/dev/null 2>&1; then
    realpath -m -- "$1"
  elif command -v realpath >/dev/null 2>&1 && [ -e "$1" ]; then
    realpath -- "$1"
  else
    node -e 'process.stdout.write(require("node:path").resolve(process.argv[1]))' "$1"
  fi
}

deploy_path="$(normalize_path "$deploy_path")"

case "$deploy_path" in
  /|/srv|/opt|/etc|/var|/home|/root)
    echo "production deploy path is too broad" >&2
    exit 2
    ;;
esac

paths_overlap() {
  left="$1"
  right="$2"
  [ "$left" = "$right" ] ||
    [ "${left#"$right"/}" != "$left" ] ||
    [ "${right#"$left"/}" != "$right" ]
}

for reserved_path in \
  /srv/agent-studio \
  /srv/agent-studio-runtime \
  /srv/managed-projects/jinhu-smart-park \
  /etc/anksen-runner \
  /opt/phoenix-runner
do
  reserved_path="$(normalize_path "$reserved_path")"
  if paths_overlap "$deploy_path" "$reserved_path"; then
    echo "production deploy path overlaps a protected Studio or runner boundary" >&2
    exit 2
  fi
done

echo "Production deploy path boundary check passed."
