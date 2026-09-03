#!/usr/bin/env sh
set -eu

root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM
mkdir -p "$tmp/bin"
script="$root/scripts/diagnose-yuzhou-hr-production-preimport-snapshot.sh"
workflow="$root/.github/workflows/deploy-production.yml"

cat > "$tmp/bin/docker" <<'SH'
#!/bin/sh
set -eu
cat >/dev/null
printf '%s\n' "${FAKE_PREIMPORT_PROBE:?}"
exit "${FAKE_PREIMPORT_EXIT:-0}"
SH
chmod 700 "$tmp/bin/docker"

hash_a='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
hash_b='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
hash_c='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
hash_d='dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
FAKE_PREIMPORT_PROBE="NOTICE:  YUZHOU_HR_PREIMPORT_ROW|0|1|1|prod-db$(printf '\037')service-user$(printf '\037')127.0.0.1$(printf '\037')5432$(printf '\037')123$(printf '\037')tenant-private$(printf '\037')park-private|tenant-private|park-private
NOTICE:  YUZHOU_HR_PREIMPORT_ROW|1|T0|3|$hash_a|$hash_b|0|$hash_c|$hash_d
NOTICE:  YUZHOU_HR_PREIMPORT_ROW|1|T1|2|$hash_a|$hash_b|0|$hash_c|$hash_d
NOTICE:  YUZHOU_HR_PREIMPORT_ROW|1|T2|1|$hash_a|$hash_b|0|$hash_c|$hash_d
NOTICE:  YUZHOU_HR_PREIMPORT_ROW|1|T3|4|$hash_a|$hash_b|0|$hash_c|$hash_d" \
  PATH="$tmp/bin:$PATH" sh "$script" report . > "$tmp/valid.json"

valid="$(cat "$tmp/valid.json")"
case "$valid" in *'"kind":"yuzhou_hr_production_preimport_snapshot_readonly"'*'"status":"HOLD"'*'"sourceIdentityBinding":"PENDING_SOURCE_MANIFEST"'*'"exactSourceIdentity":false'*'"PRODUCTION_IMPORT_SOURCE_MANIFEST_REQUIRED"'*) ;; *) echo 'preimport snapshot receipt contract failed' >&2; exit 1;; esac
case "$valid" in *'"PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED"'*) ;; *) echo 'preimport snapshot must retain an unallowlisted target reason' >&2; exit 1;; esac
case "$valid" in *prod-db*|*service-user*|*tenant-private*|*park-private*) echo 'preimport snapshot leaked raw target identity' >&2; exit 1;; esac

deploy="$tmp/deploy"
mkdir -p "$deploy/scripts/hr-cutover/contracts"
separator="$(printf '\037')"
allowlisted_hash="$(printf 'yuzhou-hr-production-target-v1:prod-db%sservice-user%s127.0.0.1%s5432%s123%stenant-private%spark-private' "$separator" "$separator" "$separator" "$separator" "$separator" "$separator" | shasum -a 256 | awk '{print $1}')"
printf '{"formatVersion":1,"contractKind":"yuzhou_hr_production_import_target_allowlist","status":"PASS","allowedTargets":[{"environment":"production","alias":"jinhu-smart-park-production","identitySha256":"%s"}],"reasonCodes":[]}' "$allowlisted_hash" > "$deploy/scripts/hr-cutover/contracts/production-import-target-allowlist-v1.json"
FAKE_PREIMPORT_PROBE="NOTICE:  YUZHOU_HR_PREIMPORT_ROW|0|1|1|prod-db$(printf '\037')service-user$(printf '\037')127.0.0.1$(printf '\037')5432$(printf '\037')123$(printf '\037')tenant-private$(printf '\037')park-private|tenant-private|park-private
NOTICE:  YUZHOU_HR_PREIMPORT_ROW|1|T0|3|$hash_a|$hash_b|0|$hash_c|$hash_d
NOTICE:  YUZHOU_HR_PREIMPORT_ROW|1|T1|2|$hash_a|$hash_b|0|$hash_c|$hash_d
NOTICE:  YUZHOU_HR_PREIMPORT_ROW|1|T2|1|$hash_a|$hash_b|0|$hash_c|$hash_d
NOTICE:  YUZHOU_HR_PREIMPORT_ROW|1|T3|4|$hash_a|$hash_b|0|$hash_c|$hash_d" \
  PATH="$tmp/bin:$PATH" sh "$script" report "$deploy" > "$tmp/allowlisted.json"

allowlisted="$(cat "$tmp/allowlisted.json")"
case "$allowlisted" in *'"status":"HOLD"'*'"PRODUCTION_IMPORT_PREBACKUP_RECEIPT_REQUIRED"'*'"PRODUCTION_IMPORT_SOURCE_MANIFEST_REQUIRED"'*) ;; *) echo 'allowlisted preimport snapshot must remain hold-only' >&2; exit 1;; esac
case "$allowlisted" in *'"PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED"'*) echo 'allowlisted preimport snapshot retained stale target reason' >&2; exit 1;; esac
case "$allowlisted" in *prod-db*|*service-user*|*tenant-private*|*park-private*) echo 'allowlisted preimport snapshot leaked raw target identity' >&2; exit 1;; esac

if FAKE_PREIMPORT_PROBE='ERROR: permission denied for relation hidden_target' \
  FAKE_PREIMPORT_EXIT=1 PATH="$tmp/bin:$PATH" sh "$script" report . > "$tmp/failure.out" 2> "$tmp/failure.err"; then
  echo 'preimport snapshot must fail closed when the read-only role lacks a required grant' >&2
  exit 1
fi
grep -Fxq 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DB_PERMISSION_DENIED' "$tmp/failure.err"
if grep -Fq 'hidden_target' "$tmp/failure.err"; then
  echo 'preimport snapshot failure must not echo raw database diagnostics' >&2
  exit 1
fi

assert_failure_class() {
  expected="$1"
  diagnostic="$2"
  if FAKE_PREIMPORT_PROBE="$diagnostic" \
    FAKE_PREIMPORT_EXIT=1 PATH="$tmp/bin:$PATH" sh "$script" report . > "$tmp/failure.out" 2> "$tmp/failure.err"; then
    echo 'preimport snapshot must fail closed for a classified probe error' >&2
    exit 1
  fi
  grep -Fxq "$expected" "$tmp/failure.err"
  if grep -Fq 'hidden_' "$tmp/failure.err"; then
    echo 'preimport snapshot classification leaked raw diagnostics' >&2
    exit 1
  fi
}

assert_failure_class 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DB_AUTH_FAILED' 'FATAL: password authentication failed for user hidden_service'
assert_failure_class 'YUZHOU_HR_PREIMPORT_SNAPSHOT_RUNTIME_UNAVAILABLE' 'Error response from daemon: container hidden_postgres is not running'
assert_failure_class 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DATABASE_UNAVAILABLE' 'FATAL: database "hidden_database" does not exist'
assert_failure_class 'YUZHOU_HR_PREIMPORT_SNAPSHOT_SCHEMA_MISSING' 'ERROR: relation hidden_table does not exist'
assert_failure_class 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DIGEST_UNAVAILABLE' 'ERROR: function digest(hidden_value, unknown) does not exist'
assert_failure_class 'YUZHOU_HR_PREIMPORT_SNAPSHOT_QUERY_CONTRACT_INVALID' 'ERROR: syntax error at or near hidden_token'
assert_failure_class 'YUZHOU_HR_PREIMPORT_SNAPSHOT_QUERY_CONTRACT_INVALID' 'ERROR: cannot execute CREATE TABLE in a read-only transaction'

grep -Fq 'diagnose-yuzhou-hr-preimport-snapshot' "$workflow"
grep -Fq 'Diagnose Yuzhou HR pre-import snapshot (read-only)' "$workflow"
grep -Fq 'yuzhou-hr-production-preimport-snapshot' "$workflow"
exclusions="$(grep -Fc "inputs.deploy_mode != 'diagnose-yuzhou-hr-preimport-snapshot'" "$workflow")"
test "$exclusions" -eq 9

grep -Fq 'BEGIN TRANSACTION READ ONLY;' "$script"
if grep -Fq 'CREATE TEMP TABLE' "$script"; then echo 'preimport snapshot must not issue DDL inside its read-only transaction' >&2; exit 1; fi
grep -Fq 'legacy_record_map map JOIN public.%I value' "$script"
grep -Fq 'sys_tenant tenant' "$script"
grep -Fq 'biz_park park' "$script"
grep -Fq 'exactSourceIdentity: false' "$script"
grep -Fq 'production-import-target-allowlist-v1.json' "$script"
grep -Fq 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DB_PERMISSION_DENIED' "$script"
grep -Fq 'YUZHOU_HR_PREIMPORT_SNAPSHOT_RUNTIME_UNAVAILABLE' "$script"
grep -Fq 'YUZHOU_HR_PREIMPORT_SNAPSHOT_QUERY_CONTRACT_INVALID' "$script"

if grep -Eq '(^|[^[:alnum:]_])(rm|pg_dump|pg_restore|rsync|prod:deploy)([^[:alnum:]_]|$)' "$script"; then echo 'preimport snapshot must not mutate or transfer files' >&2; exit 1; fi
echo 'Yuzhou production pre-import snapshot contract passed.'
