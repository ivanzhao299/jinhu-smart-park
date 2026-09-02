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

cd "$deploy_path"
probe="$({
  docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
    sh -c 'database_name="${POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -F "|" -U "$POSTGRES_USER" -d "$database_name"' <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
CREATE TEMP TABLE yuzhou_hr_scope_snapshot(tenant_id text NOT NULL, park_id text NOT NULL, tenant_exists boolean NOT NULL, park_exists boolean NOT NULL) ON COMMIT DROP;
WITH hr_scope AS (
  SELECT DISTINCT btrim(assignment.tenant_id::text) AS tenant_id, btrim(assignment.park_id::text) AS park_id
  FROM rel_tenant_module assignment JOIN sys_module module ON module.id=assignment.module_id
    AND module.module_code='hr' AND module.is_deleted=false
  WHERE assignment.enabled=true AND assignment.status='enabled' AND assignment.is_deleted=false
    AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
    AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
)
INSERT INTO yuzhou_hr_scope_snapshot
SELECT scope.tenant_id, scope.park_id,
  EXISTS (SELECT 1 FROM sys_tenant tenant WHERE btrim(tenant.tenant_id::text)=scope.tenant_id AND tenant.status=1 AND tenant.is_deleted=false AND (tenant.expire_time IS NULL OR tenant.expire_time>clock_timestamp())),
  EXISTS (SELECT 1 FROM biz_park park WHERE btrim(park.tenant_id::text)=scope.tenant_id AND btrim(park.park_id::text)=scope.park_id AND park.status=1 AND park.is_deleted=false)
FROM hr_scope scope;
DO $$
DECLARE current_tenant text; current_park text; item record; target_count bigint; target_hash text; map_count bigint; map_hash text; source_hash text;
BEGIN
  IF (SELECT count(*) FROM yuzhou_hr_scope_snapshot)<>1 OR (SELECT count(*) FROM yuzhou_hr_scope_snapshot WHERE tenant_exists AND park_exists)<>1 THEN RAISE EXCEPTION 'YUZHOU_HR_SCOPE_UNRESOLVED'; END IF;
  SELECT tenant_id,park_id INTO current_tenant,current_park FROM yuzhou_hr_scope_snapshot WHERE tenant_exists AND park_exists;
  CREATE TEMP TABLE yuzhou_hr_phase_table_snapshot(phase text NOT NULL, table_name text NOT NULL, target_row_count bigint NOT NULL, target_canonical_sha256 text NOT NULL, active_map_count bigint NOT NULL, active_map_sha256 text NOT NULL, source_identity_ledger_sha256 text NOT NULL, PRIMARY KEY(phase,table_name)) ON COMMIT DROP;
  FOR item IN SELECT * FROM (VALUES
    ('T0','sys_org'),('T0','hr_position'),('T0','hr_employee'),('T1','hr_employment_event'),
    ('T2','hr_contract_type'),('T2','hr_contract'),('T2','hr_contract_change'),('T2','hr_contract_legacy_evidence'),
    ('T3','hr_attendance_import_batch'),('T3','hr_attendance_symbol_rule'),('T3','hr_attendance_calendar_source'),('T3','hr_attendance_day'),
    ('T3','hr_insurance_policy'),('T3','hr_insurance_policy_item'),('T3','hr_employee_insurance_period'),('T3','hr_employee_insurance_item')
  ) AS items(phase,table_name) ORDER BY phase,table_name LOOP
    EXECUTE format($query$SELECT count(*)::bigint, encode(digest(coalesce(string_agg(encode(digest(to_jsonb(value)::text,'sha256'),'hex'),'' ORDER BY encode(digest(to_jsonb(value)::text,'sha256'),'hex')),''),'sha256'),'hex') FROM public.%I value WHERE value.tenant_id=$1 AND value.park_id=$2$query$, item.table_name) INTO target_count,target_hash USING current_tenant,current_park;
    EXECUTE format($query$SELECT count(*)::bigint, encode(digest(coalesce(string_agg(map.source_identity_sha256||':'||map.source_row_sha256||':'||map.target_id::text,'' ORDER BY map.source_identity_sha256,map.source_row_sha256,map.target_id::text),''),'sha256'),'hex'), encode(digest(coalesce(string_agg(map.source_identity_sha256,'' ORDER BY map.source_identity_sha256),''),'sha256'),'hex') FROM legacy_record_map map JOIN public.%I value ON value.id=map.target_id WHERE map.source_system='yuzhou-v10' AND map.target_table=$3 AND map.is_active=true AND value.tenant_id=$1 AND value.park_id=$2$query$, item.table_name) INTO map_count,map_hash,source_hash USING current_tenant,current_park,item.table_name;
    INSERT INTO yuzhou_hr_phase_table_snapshot VALUES(item.phase,item.table_name,target_count,target_hash,map_count,map_hash,source_hash);
  END LOOP;
END $$;
SELECT concat_ws('|','0',(SELECT count(*)::text FROM yuzhou_hr_scope_snapshot),(SELECT count(*) FILTER (WHERE tenant_exists AND park_exists)::text FROM yuzhou_hr_scope_snapshot),coalesce((SELECT concat_ws(E'\x1f',current_database(),current_user,coalesce(inet_server_addr()::text,''),coalesce(inet_server_port()::text,''),(SELECT oid::text FROM pg_database WHERE datname=current_database()),tenant_id,park_id) FROM yuzhou_hr_scope_snapshot WHERE tenant_exists AND park_exists),''),coalesce((SELECT tenant_id FROM yuzhou_hr_scope_snapshot WHERE tenant_exists AND park_exists),''),coalesce((SELECT park_id FROM yuzhou_hr_scope_snapshot WHERE tenant_exists AND park_exists),''));
SELECT concat_ws('|','1',phase,sum(target_row_count)::text,encode(digest(string_agg(table_name||':'||target_canonical_sha256,E'\n' ORDER BY table_name),'sha256'),'hex'),encode(digest(string_agg(table_name||':'||target_row_count::text||':'||target_canonical_sha256,E'\n' ORDER BY table_name),'sha256'),'hex'),sum(active_map_count)::text,encode(digest(string_agg(table_name||':'||active_map_sha256,E'\n' ORDER BY table_name),'sha256'),'hex'),encode(digest(string_agg(table_name||':'||source_identity_ledger_sha256,E'\n' ORDER BY table_name),'sha256'),'hex')) FROM yuzhou_hr_phase_table_snapshot GROUP BY phase ORDER BY phase;
COMMIT;
SQL
} 2>&1)" || {
  # The database client can include connection details or query fragments in
  # its raw stderr. Keep that diagnostic in-process and surface only a stable,
  # non-sensitive failure class to the deployment log.
  case "$probe" in
    *YUZHOU_HR_SCOPE_UNRESOLVED*)
      echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_SCOPE_UNRESOLVED' >&2
      ;;
    *'permission denied'*)
      echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DB_PERMISSION_DENIED' >&2
      ;;
    *'relation '*' does not exist'*)
      echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_SCHEMA_MISSING' >&2
      ;;
    *'function digest'*' does not exist'*)
      echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_DIGEST_UNAVAILABLE' >&2
      ;;
    *)
      echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_PROBE_FAILED' >&2
      ;;
  esac
  exit 1
}

target_line="$(printf '%s\n' "$probe" | sed -n '1p')"
IFS='|' read -r marker scope_count valid_scope_count target_material tenant_id park_id <<EOF
$target_line
EOF
case "$marker:$scope_count:$valid_scope_count" in 0:1:1) ;; *) echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_INVALID' >&2; exit 3 ;; esac
test -n "$target_material" && test -n "$tenant_id" && test -n "$park_id" || { echo 'YUZHOU_HR_PREIMPORT_SNAPSHOT_INVALID' >&2; exit 3; }
target_hash="$(hash_value "yuzhou-hr-production-target-v1:$target_material")"
scope_hash="$(hash_value "yuzhou-hr-production-scope-v1:$tenant_id:$park_id")"
phase_rows="$(printf '%s\n' "$probe" | sed '1d')"

TARGET_HASH="$target_hash" SCOPE_HASH="$scope_hash" PHASE_ROWS="$phase_rows" node <<'NODE'
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
process.stdout.write(`${JSON.stringify({ formatVersion: 1, kind: "yuzhou_hr_production_preimport_snapshot_readonly", status: "HOLD", productionImport: "HOLD", executionReachable: false, targetIdentitySha256: process.env.TARGET_HASH, targetScopeSha256: process.env.SCOPE_HASH, sourceIdentityBinding: "PENDING_SOURCE_MANIFEST", phases, reasonCodes: ["PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED", "PRODUCTION_IMPORT_PREBACKUP_RECEIPT_REQUIRED", "PRODUCTION_IMPORT_SOURCE_MANIFEST_REQUIRED"] })}\n`);
NODE
