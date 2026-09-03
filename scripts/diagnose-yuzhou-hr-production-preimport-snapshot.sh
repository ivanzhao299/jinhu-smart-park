#!/usr/bin/env sh

# Read-only target snapshot for the Yuzhou HR production import gate. It emits
# only scoped counts and SHA-256 digests; source-manifest binding is deliberately
# absent, so this receipt can never be used as a sealed import artifact.
set -eu

mode="${1:-report}"
deploy_path="${2:-.}"
compose_file="${COMPOSE_FILE:-infra/docker/docker-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"

case "$mode" in report) ;; *) echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_USAGE' >&2; exit 2 ;; esac
case "$deploy_path" in /*|.) ;; *) echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_INVALID_PATH' >&2; exit 2 ;; esac

hash_value() {
  if command -v sha256sum >/dev/null 2>&1; then printf '%s' "$1" | sha256sum | awk '{print $1}';
  else printf '%s' "$1" | shasum -a 256 | awk '{print $1}'; fi
}

classify_probe_failure() {
  # psql and Docker may include target identifiers in their diagnostics.  Match
  # only stable error classes here; callers receive the class, never the raw
  # output captured by the probe.
  case "$1" in
    *YUZHOU_HR_SCOPE_UNRESOLVED*)
      printf '%s\n' 'YUZHOU_HR_PREIMPORT_SNAPSHOT_SCOPE_UNRESOLVED'
      ;;
    *'password authentication failed'*|*'no password supplied'*|*'authentication failed'*|*'role "'*'" does not exist'*)
      printf '%s\n' 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DB_AUTH_FAILED'
      ;;
    *'could not connect to server'*|*'connection refused'*|*'connection timed out'*|*'server closed the connection unexpectedly'*|*'the database system is starting up'*|*'is not running'*|*'No such container'*|*'No such service: postgres'*)
      printf '%s\n' 'YUZHOU_HR_PREIMPORT_SNAPSHOT_RUNTIME_UNAVAILABLE'
      ;;
    *'permission denied'*)
      printf '%s\n' 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DB_PERMISSION_DENIED'
      ;;
    *'database "'*'" does not exist'*)
      printf '%s\n' 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DATABASE_UNAVAILABLE'
      ;;
    *'function digest'*' does not exist'*)
      printf '%s\n' 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DIGEST_UNAVAILABLE'
      ;;
    *'relation '*' does not exist'*|*'column '*' does not exist'*|*'type '*' does not exist'*)
      printf '%s\n' 'YUZHOU_HR_PREIMPORT_SNAPSHOT_SCHEMA_MISSING'
      ;;
    *'syntax error at or near'*|*'cannot execute '*'in a read-only transaction'*|*'current transaction is aborted'*)
      printf '%s\n' 'YUZHOU_HR_PREIMPORT_SNAPSHOT_QUERY_CONTRACT_INVALID'
      ;;
    *)
      printf '%s\n' 'YUZHOU_HR_PREIMPORT_SNAPSHOT_PROBE_FAILED'
      ;;
  esac
}

cd "$deploy_path"
probe="$({
  docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
    sh -c 'database_name="${POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -F "|" -U "$POSTGRES_USER" -d "$database_name"' <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
DO $$
DECLARE
  current_tenant text; current_park text; item record; phase_item record;
  scope_count bigint; valid_scope_count bigint; target_material text;
  target_count bigint; target_hash text; map_count bigint; map_hash text; source_hash text;
  phase_target_count bigint; phase_map_count bigint;
  phase_canonical_ledger text; phase_table_ledger text; phase_map_ledger text; phase_source_identity_ledger text;
BEGIN
  WITH hr_scope AS (
    SELECT DISTINCT btrim(assignment.tenant_id::text) AS tenant_id, btrim(assignment.park_id::text) AS park_id
    FROM rel_tenant_module assignment JOIN sys_module module ON module.id=assignment.module_id
      AND module.module_code='hr' AND module.is_deleted=false
    WHERE assignment.enabled=true AND assignment.status='enabled' AND assignment.is_deleted=false
      AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
      AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
  ), scope_snapshot AS (
    SELECT scope.tenant_id, scope.park_id,
      EXISTS (SELECT 1 FROM sys_tenant tenant WHERE btrim(tenant.tenant_id::text)=scope.tenant_id AND tenant.status=1 AND tenant.is_deleted=false AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp())) AS tenant_exists,
      EXISTS (SELECT 1 FROM biz_park park WHERE btrim(park.tenant_id::text)=scope.tenant_id AND btrim(park.park_id::text)=scope.park_id AND park.status=1 AND park.is_deleted=false) AS park_exists
    FROM hr_scope scope
  )
  SELECT count(*), count(*) FILTER (WHERE tenant_exists AND park_exists),
    coalesce(max(concat_ws(E'\x1f',current_database(),current_user,coalesce(inet_server_addr()::text,''),coalesce(inet_server_port()::text,''),(SELECT oid::text FROM pg_database WHERE datname=current_database()),tenant_id,park_id)) FILTER (WHERE tenant_exists AND park_exists),''),
    coalesce(max(tenant_id) FILTER (WHERE tenant_exists AND park_exists),''),
    coalesce(max(park_id) FILTER (WHERE tenant_exists AND park_exists),'')
  INTO scope_count,valid_scope_count,target_material,current_tenant,current_park
  FROM scope_snapshot;
  RAISE NOTICE 'YUZHOU_HR_PREIMPORT_ROW|0|%|%|%|%|%',scope_count,valid_scope_count,target_material,current_tenant,current_park;
  IF scope_count<>1 OR valid_scope_count<>1 THEN RETURN; END IF;
  FOR phase_item IN SELECT * FROM (VALUES ('T0'),('T1'),('T2'),('T3')) AS phases(phase) ORDER BY phase LOOP
    phase_target_count:=0; phase_map_count:=0;
    phase_canonical_ledger:=NULL; phase_table_ledger:=NULL; phase_map_ledger:=NULL; phase_source_identity_ledger:=NULL;
    FOR item IN SELECT table_name FROM (VALUES
      ('T0','sys_org'),('T0','hr_position'),('T0','hr_employee'),('T1','hr_employment_event'),
      ('T2','hr_contract_type'),('T2','hr_contract'),('T2','hr_contract_change'),('T2','hr_contract_legacy_evidence'),
      ('T3','hr_attendance_import_batch'),('T3','hr_attendance_symbol_rule'),('T3','hr_attendance_calendar_source'),('T3','hr_attendance_day'),
      ('T3','hr_insurance_policy'),('T3','hr_insurance_policy_item'),('T3','hr_employee_insurance_period'),('T3','hr_employee_insurance_item')
    ) AS items(phase,table_name) WHERE phase=phase_item.phase ORDER BY table_name LOOP
      EXECUTE format($query$SELECT count(*)::bigint, encode(digest(coalesce(string_agg(encode(digest(to_jsonb(value)::text,'sha256'),'hex'),'' ORDER BY encode(digest(to_jsonb(value)::text,'sha256'),'hex')),''),'sha256'),'hex') FROM public.%I value WHERE value.tenant_id=$1 AND value.park_id=$2$query$, item.table_name) INTO target_count,target_hash USING current_tenant,current_park;
      EXECUTE format($query$SELECT count(*)::bigint, encode(digest(coalesce(string_agg(map.source_identity_sha256||':'||map.source_row_sha256||':'||map.target_id::text,'' ORDER BY map.source_identity_sha256,map.source_row_sha256,map.target_id::text),''),'sha256'),'hex'), encode(digest(coalesce(string_agg(map.source_identity_sha256,'' ORDER BY map.source_identity_sha256),''),'sha256'),'hex') FROM legacy_record_map map JOIN public.%I value ON value.id=map.target_id WHERE map.source_system='yuzhou-v10' AND map.target_table=$3 AND map.is_active=true AND value.tenant_id=$1 AND value.park_id=$2$query$, item.table_name) INTO map_count,map_hash,source_hash USING current_tenant,current_park,item.table_name;
      phase_target_count:=phase_target_count+target_count; phase_map_count:=phase_map_count+map_count;
      phase_canonical_ledger:=concat_ws(E'\n',phase_canonical_ledger,item.table_name||':'||target_hash);
      phase_table_ledger:=concat_ws(E'\n',phase_table_ledger,item.table_name||':'||target_count::text||':'||target_hash);
      phase_map_ledger:=concat_ws(E'\n',phase_map_ledger,item.table_name||':'||map_hash);
      phase_source_identity_ledger:=concat_ws(E'\n',phase_source_identity_ledger,item.table_name||':'||source_hash);
    END LOOP;
    RAISE NOTICE 'YUZHOU_HR_PREIMPORT_ROW|1|%|%|%|%|%|%|%',phase_item.phase,phase_target_count,
      encode(digest(coalesce(phase_canonical_ledger,''),'sha256'),'hex'),
      encode(digest(coalesce(phase_table_ledger,''),'sha256'),'hex'),phase_map_count,
      encode(digest(coalesce(phase_map_ledger,''),'sha256'),'hex'),
      encode(digest(coalesce(phase_source_identity_ledger,''),'sha256'),'hex');
  END LOOP;
END $$;
COMMIT;
SQL
} 2>&1)" || {
  # The database client can include connection details or query fragments in
  # its raw stderr. Keep that diagnostic in-process and surface only a stable,
  # non-sensitive failure class to the deployment log.
  classify_probe_failure "$probe" >&2
  exit 1
}

probe_rows="$(printf '%s\n' "$probe" | sed -n 's/^NOTICE:[[:space:]]*YUZHOU_HR_PREIMPORT_ROW|//p')"
test -n "$probe_rows" || { echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_INVALID' >&2; exit 3; }
target_line="$(printf '%s\n' "$probe_rows" | sed -n '1p')"
IFS='|' read -r marker scope_count valid_scope_count target_material tenant_id park_id <<EOF
$target_line
EOF
case "$marker:$scope_count:$valid_scope_count" in 0:1:1) ;; *) echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_INVALID' >&2; exit 3 ;; esac
test -n "$target_material" && test -n "$tenant_id" && test -n "$park_id" || { echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_INVALID' >&2; exit 3; }
target_hash="$(hash_value "yuzhou-hr-production-target-v1:$target_material")"
scope_hash="$(hash_value "yuzhou-hr-production-scope-v1:$tenant_id:$park_id")"
phase_rows="$(printf '%s\n' "$probe_rows" | sed '1d')"

TARGET_HASH="$target_hash" SCOPE_HASH="$scope_hash" PHASE_ROWS="$phase_rows" node <<'NODE'
import { readFileSync } from "node:fs";

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ALIAS = /^[a-z0-9][a-z0-9-]{2,63}$/u;

function isExactReviewedTarget(targetIdentitySha256) {
  // This remains a diagnostic-only check: an allowlist match removes only the
  // stale allowlist reason.  It never enables the writer or substitutes for
  // source, backup, before-image, record-map, or authorization evidence.
  try {
    const allowlist = JSON.parse(readFileSync("scripts/hr-cutover/contracts/production-import-target-allowlist-v1.json", "utf8"));
    if (allowlist?.formatVersion !== 1 || allowlist.contractKind !== "yuzhou_hr_production_import_target_allowlist" || allowlist.status !== "PASS" || !Array.isArray(allowlist.allowedTargets) || !Array.isArray(allowlist.reasonCodes) || allowlist.reasonCodes.length !== 0) return false;
    const targets = allowlist.allowedTargets;
    if (targets.length !== 1) return false;
    const [target] = targets;
    if (!target || Object.keys(target).sort().join(",") !== "alias,environment,identitySha256" || target.environment !== "production" || !SAFE_ALIAS.test(target.alias ?? "") || !SHA256.test(target.identitySha256 ?? "")) return false;
    return target.identitySha256 === targetIdentitySha256;
  } catch {
    return false;
  }
}

const rows = process.env.PHASE_ROWS.split("\n").filter(Boolean);
const phases = {};
for (const row of rows) {
  const [marker, phase, beforeRows, canonicalSha256, tableLedgerSha256, mapRows, activeMapSha256, sourceIdentityLedgerSha256] = row.split("|");
  if (marker !== "1" || !["T0", "T1", "T2", "T3"].includes(phase) || !/^[0-9]+$/.test(beforeRows) || !/^[0-9]+$/.test(mapRows) || [canonicalSha256, tableLedgerSha256, activeMapSha256, sourceIdentityLedgerSha256].some(value => !/^[0-9a-f]{64}$/.test(value ?? ""))) process.exit(4);
  if (phases[phase]) process.exit(4);
  phases[phase] = {
    beforeImageCandidate: { canonicalSha256, tableLedgerSha256, rowCount: Number(beforeRows) },
    activeRecordMapCandidate: { activeMapSha256, sourceIdentityLedgerSha256, rowCount: Number(mapRows), exactSourceIdentity: false },
  };
}
if (JSON.stringify(Object.keys(phases)) !== JSON.stringify(["T0", "T1", "T2", "T3"])) process.exit(4);
const reasonCodes = [
  ...(isExactReviewedTarget(process.env.TARGET_HASH) ? [] : ["PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED"]),
  "PRODUCTION_IMPORT_PREBACKUP_RECEIPT_REQUIRED",
  "PRODUCTION_IMPORT_SOURCE_MANIFEST_REQUIRED",
];
process.stdout.write(`${JSON.stringify({ formatVersion: 1, kind: "yuzhou_hr_production_preimport_snapshot_readonly", status: "HOLD", productionImport: "HOLD", executionReachable: false, targetIdentitySha256: process.env.TARGET_HASH, targetScopeSha256: process.env.SCOPE_HASH, sourceIdentityBinding: "PENDING_SOURCE_MANIFEST", phases, reasonCodes })}\n`);
NODE
