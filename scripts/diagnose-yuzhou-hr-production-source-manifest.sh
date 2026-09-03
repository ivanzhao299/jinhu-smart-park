#!/usr/bin/env sh
# This is an ops-only source integrity diagnosis. The private configuration,
# source backup and staging files remain on the production host; stdout is a
# stable, hash-only receipt and never includes config values or source rows.
set -eu

action="${1:-}"
deploy_path="${2:-}"

if [ "$action" != "report" ] || [ -z "$deploy_path" ]; then
  printf '%s\n' '{"status":"HOLD","reasonCode":"PRODUCTION_SOURCE_MANIFEST_ARGUMENT_INVALID","productionImport":"HOLD"}'
  exit 0
fi

config_path="$deploy_path/.private/yuzhou-hr-production-source-manifest.json"
if [ ! -f "$config_path" ] || [ -L "$config_path" ] || [ "$(stat -c '%a' "$config_path" 2>/dev/null || stat -f '%Lp' "$config_path" 2>/dev/null || true)" != "600" ]; then
  printf '%s\n' '{"status":"HOLD","reasonCode":"PRODUCTION_SOURCE_MANIFEST_CONFIG_UNAVAILABLE","productionImport":"HOLD"}'
  exit 0
fi

receipt_file="$(mktemp)"
error_file="$(mktemp)"
cleanup() { rm -f "$receipt_file" "$error_file"; }
trap cleanup EXIT HUP INT TERM

set +e
node "$deploy_path/scripts/prepare-yuzhou-production-source-manifest.mjs" --config "$config_path" >"$receipt_file" 2>"$error_file"
result=$?
set -e

if [ "$result" -eq 0 ]; then
  # The Node entrypoint emits precisely the approved hash-only receipt.
  cat "$receipt_file"
  exit 0
fi

reason_code="$(tr -d '\r\n' <"$error_file")"
case "$reason_code" in
  PRODUCTION_SOURCE_MANIFEST_ARGUMENT_INVALID|PRODUCTION_SOURCE_MANIFEST_CONFIG_UNSAFE|PRODUCTION_SOURCE_MANIFEST_CONFIG_INVALID|PRODUCTION_SOURCE_MANIFEST_SOURCE_UNSAFE|PRODUCTION_SOURCE_MANIFEST_RECEIPT_INVALID|PRODUCTION_SOURCE_MANIFEST_RECEIPT_DRIFT|PRODUCTION_SOURCE_MANIFEST_STAGE_UNSAFE|PRODUCTION_SOURCE_MANIFEST_STAGE_INVALID|PRODUCTION_SOURCE_MANIFEST_STAGE_BINDING_DRIFT|PRODUCTION_SOURCE_MANIFEST_STAGE_CONTENT_DRIFT|PRODUCTION_SOURCE_MANIFEST_OUTPUT_UNSAFE|PRODUCTION_SOURCE_MANIFEST_OUTPUT_EXISTS|PRODUCTION_SOURCE_MANIFEST_WRITE_FAILED)
    printf '{"status":"HOLD","reasonCode":"%s","productionImport":"HOLD"}\n' "$reason_code"
    ;;
  *)
    printf '%s\n' '{"status":"HOLD","reasonCode":"PRODUCTION_SOURCE_MANIFEST_FAILED","productionImport":"HOLD"}'
    ;;
esac
