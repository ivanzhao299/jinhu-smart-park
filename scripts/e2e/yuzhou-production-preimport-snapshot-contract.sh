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
SH
chmod 700 "$tmp/bin/docker"

hash_a='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
hash_b='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
hash_c='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
hash_d='dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
FAKE_PREIMPORT_PROBE="0|1|1|prod-db$(printf '\037')service-user$(printf '\037')127.0.0.1$(printf '\037')5432$(printf '\037')123$(printf '\037')tenant-private$(printf '\037')park-private|tenant-private|park-private
1|T0|3|$hash_a|$hash_b|0|$hash_c|$hash_d
1|T1|2|$hash_a|$hash_b|0|$hash_c|$hash_d
1|T2|1|$hash_a|$hash_b|0|$hash_c|$hash_d
1|T3|4|$hash_a|$hash_b|0|$hash_c|$hash_d" \
  PATH="$tmp/bin:$PATH" sh "$script" report . > "$tmp/valid.json"

valid="$(cat "$tmp/valid.json")"
case "$valid" in *'"kind":"yuzhou_hr_production_preimport_snapshot_readonly"'*'"status":"HOLD"'*'"sourceIdentityBinding":"PENDING_SOURCE_MANIFEST"'*'"exactSourceIdentity":false'*'"PRODUCTION_IMPORT_SOURCE_MANIFEST_REQUIRED"'*) ;; *) echo 'preimport snapshot receipt contract failed' >&2; exit 1;; esac
case "$valid" in *prod-db*|*service-user*|*tenant-private*|*park-private*) echo 'preimport snapshot leaked raw target identity' >&2; exit 1;; esac

grep -Fq 'diagnose-yuzhou-hr-preimport-snapshot' "$workflow"
grep -Fq 'Diagnose Yuzhou HR pre-import snapshot (read-only)' "$workflow"
grep -Fq 'yuzhou-hr-production-preimport-snapshot' "$workflow"
exclusions="$(grep -Fc "inputs.deploy_mode != 'diagnose-yuzhou-hr-preimport-snapshot'" "$workflow")"
test "$exclusions" -eq 9

grep -Fq 'BEGIN TRANSACTION READ ONLY;' "$script"
grep -Fq 'legacy_record_map map JOIN public.%I value' "$script"
grep -Fq 'sys_tenant tenant' "$script"
grep -Fq 'biz_park park' "$script"
grep -Fq 'exactSourceIdentity: false' "$script"

if grep -Eq '(^|[^[:alnum:]_])(rm|pg_dump|pg_restore|rsync|prod:deploy)([^[:alnum:]_]|$)' "$script"; then echo 'preimport snapshot must not mutate or transfer files' >&2; exit 1; fi
echo 'Yuzhou production pre-import snapshot contract passed.'
