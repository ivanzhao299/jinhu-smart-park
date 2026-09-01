#!/bin/sh

set -eu

root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM
mkdir -p "$tmp/bin"

cat > "$tmp/bin/docker" <<'SH'
#!/bin/sh
set -eu
query="$(cat)"
case "$query" in
  *pg_control_system*) echo "target probe must not require a privileged cluster function" >&2; exit 41 ;;
  *pg_database*) ;;
  *) echo "target probe must bind a public database catalog identity" >&2; exit 42 ;;
esac
printf '%s\n' "${FAKE_TARGET_PROBE:?}"
SH
chmod 700 "$tmp/bin/docker"

PATH="$tmp/bin:$PATH" FAKE_TARGET_PROBE='1|1|prod-db:service-user:127.0.0.1:5432:1234567890123:tenant-secret:park-secret|tenant-secret|park-secret' \
  sh "$root/scripts/diagnose-yuzhou-hr-production-target.sh" report . > "$tmp/valid.json"

valid="$(cat "$tmp/valid.json")"
case "$valid" in
  *'"status":"HOLD"'*'"productionImport":"HOLD"'*'"executionReachable":false'*'"scopeAssignmentCount":1'*'"validScopeCount":1'*'"PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED"'*'"PRODUCTION_IMPORT_PREBACKUP_RECEIPT_REQUIRED"'*) ;;
  *) echo "valid target attestation contract failed" >&2; exit 1 ;;
esac
case "$valid" in
  *prod-db*|*service-user*|*tenant-secret*|*park-secret*) echo "raw target identity leaked" >&2; exit 1 ;;
esac

PATH="$tmp/bin:$PATH" FAKE_TARGET_PROBE='2|1|prod-db:service-user:127.0.0.1:5432:1234567890123:tenant-secret:park-secret|tenant-secret|park-secret' \
  sh "$root/scripts/diagnose-yuzhou-hr-production-target.sh" report . > "$tmp/ambiguous.json"

ambiguous="$(cat "$tmp/ambiguous.json")"
case "$ambiguous" in
  *'"targetIdentitySha256":null'*'"targetScopeSha256":null'*'"PRODUCTION_IMPORT_TARGET_SCOPE_UNRESOLVED"'*) ;;
  *) echo "ambiguous target attestation contract failed" >&2; exit 1 ;;
esac

cat > "$tmp/bin/docker" <<'SH'
#!/bin/sh
set -eu
cat >/dev/null
echo 'private-target-detail-must-not-escape' >&2
exit 9
SH
chmod 700 "$tmp/bin/docker"
if PATH="$tmp/bin:$PATH" sh "$root/scripts/diagnose-yuzhou-hr-production-target.sh" report . > "$tmp/failure.out" 2> "$tmp/failure.err"; then
  echo "target probe failure unexpectedly succeeded" >&2
  exit 1
fi
grep -qx 'YUZHOU_HR_PRODUCTION_TARGET_PROBE_FAILED' "$tmp/failure.err"
if grep -q 'private-target-detail-must-not-escape' "$tmp/failure.err"; then
  echo "target probe failure leaked private runtime detail" >&2
  exit 1
fi

echo "Yuzhou production target read-only attestation contract passed."
