#!/bin/sh

set -eu

mode="${1:-report}"
deploy_path="${2:-.}"
database_name="${3:-}"
compose_file="${COMPOSE_FILE:-infra/docker/docker-compose.prod.yml}"
env_file="${ENV_FILE-.env.production}"

case "$mode" in
  report|repair) ;;
  *)
    echo "Usage: $0 [report|repair] [production-deploy-path] [database]" >&2
    exit 2
    ;;
esac

cd "$deploy_path"

run_psql() {
  if [ -n "$env_file" ]; then
    docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
      sh -c 'database_name="${1:-$POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -F "|" -U "$POSTGRES_USER" -d "$database_name"' \
      sh "$database_name"
  else
    docker compose -f "$compose_file" exec -T postgres \
      sh -c 'database_name="${1:-$POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -F "|" -U "$POSTGRES_USER" -d "$database_name"' \
      sh "$database_name"
  fi
}

table_state="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SELECT
  CASE WHEN to_regclass('public.sys_property_runtime_control') IS NULL THEN 'no' ELSE 'yes' END,
  CASE WHEN to_regclass('public.sys_property_runtime_control_contract_audit') IS NULL THEN 'no' ELSE 'yes' END;
COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$table_state" >&2
  exit "$rc"
}

case "$table_state" in
  "yes|yes") ;;
  *)
    echo "000194 retired runtime owner repair diagnostic"
    echo "classification|tenant_id|park_id|controls|valid_controls|audits|valid_audits_194|valid_audits_195|live_asset_parks|deleted_asset_parks|live_biz_parks|deleted_biz_parks|live_asset_assignments|deleted_asset_assignments"
    echo "ready_table_absent_reconcile|||||||||||||"
    printf 'summary: ready=0 blocked=0 mode=%s table=absent\n' "$mode"
    exit 0
    ;;
esac

history_table_state="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SELECT CASE
  WHEN to_regclass('public.sys_schema_migration_history') IS NOT NULL
   AND to_regclass('public.schema_migrations') IS NOT NULL THEN 'yes'
  ELSE 'no'
END;
COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$history_table_state" >&2
  exit "$rc"
}

if [ "$history_table_state" != "yes" ]; then
  echo "000194 retired runtime owner repair diagnostic"
  echo "classification|tenant_id|park_id|controls|valid_controls|audits|valid_audits_194|valid_audits_195|live_asset_parks|deleted_asset_parks|live_biz_parks|deleted_biz_parks|live_asset_assignments|deleted_asset_assignments"
  echo "ready_contract_not_final_reconcile|||||||||||||"
  printf 'summary: ready=0 blocked=0 mode=%s contract_stage=pre_000195\n' "$mode"
  exit 0
fi

contract_state="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;
SELECT CASE
  WHEN (
    SELECT count(*)
    FROM (
      SELECT filename, checksum, status FROM public.sys_schema_migration_history
      UNION ALL
      SELECT filename, checksum, status FROM public.schema_migrations
    ) history
    WHERE filename='000195_property_mutation_receipt_contract_v2.sql'
      AND status='succeeded'
      AND checksum='9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4'
  )=2
  AND NOT EXISTS (
    SELECT 1
    FROM public.sys_schema_migration_history primary_history
    FULL JOIN public.schema_migrations standard_history USING (filename)
    WHERE coalesce(primary_history.filename,standard_history.filename)=
      '000195_property_mutation_receipt_contract_v2.sql'
      AND (primary_history.filename IS NULL OR standard_history.filename IS NULL
        OR primary_history.status IS DISTINCT FROM standard_history.status
        OR primary_history.checksum IS DISTINCT FROM standard_history.checksum)
  ) THEN 'post_000195'
  ELSE 'pre_000195'
END;
COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$contract_state" >&2
  exit "$rc"
}

case "$contract_state" in
  post_000195) ;;
  *)
    echo "000194 retired runtime owner repair diagnostic"
    echo "classification|tenant_id|park_id|controls|valid_controls|audits|valid_audits_194|valid_audits_195|live_asset_parks|deleted_asset_parks|live_biz_parks|deleted_biz_parks|live_asset_assignments|deleted_asset_assignments"
    echo "ready_contract_not_final_reconcile|||||||||||||"
    printf 'summary: ready=0 blocked=0 mode=%s contract_stage=%s\n' "$mode" "$contract_state"
    exit 0
    ;;
esac

rows="$({
  run_psql <<'SQL'
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = public, pg_catalog;

WITH signed(control_key, control_kind, target, adapter_version) AS (VALUES
  ('identity.legacy-read-v1','compatibility_read','identity',1),
  ('identity.legacy-write-v1','compatibility_write','identity',1),
  ('identity.change-capture','change_capture','identity',NULL),
  ('identity.mutation-replay','mutation_replay','identity',NULL),
  ('identity.shadow-compare','shadow_compare','identity',NULL),
  ('identity.enforce','enforce','identity',NULL),
  ('approval.shadow-compare','shadow_compare','approval',NULL),
  ('approval.enforce','enforce','approval',NULL),
  ('event-notification.shadow-compare','shadow_compare','event_notification',NULL),
  ('event-notification.enforce','enforce','event_notification',NULL),
  ('task.shadow-compare','shadow_compare','task',NULL),
  ('task.enforce','enforce','task',NULL)
), control_scope AS (
  SELECT control.tenant_id, control.park_id,
    count(*) AS actual,
    count(*) FILTER (WHERE signed.control_key IS NOT NULL
      AND control.control_kind=signed.control_kind
      AND control.target=signed.target
      AND control.adapter_version IS NOT DISTINCT FROM signed.adapter_version
      AND control.contract_hash='e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944'::char(64)
      AND control.enabled=false
      AND control.control_mode='disabled'
      AND control.enabled_by IS NULL
      AND control.enabled_at IS NULL
      AND control.approval_reference IS NULL
      AND control.disabled_reason='b2a-contract-correction-000195'
      AND control.version=3) AS valid
  FROM public.sys_property_runtime_control control
  LEFT JOIN signed ON signed.control_key=control.control_key
  GROUP BY control.tenant_id, control.park_id
), audit_scope AS (
  SELECT audit.tenant_id, audit.park_id,
	    count(*) AS actual,
	    count(*) FILTER (WHERE signed.control_key IS NOT NULL
	      AND audit.correction_key='b2a-contract-correction-000194'
	      AND audit.old_contract_hash='a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8'
	      AND audit.new_contract_hash='81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3'
	      AND audit.old_version=1
	      AND audit.new_version=2
	      AND audit.old_disabled_reason='expand-only'
	      AND audit.new_disabled_reason='b2a-contract-correction-000194'
	      AND audit.new_update_time=audit.occurred_at
	      AND audit.new_update_time>=audit.old_update_time
	      AND audit.evidence_hash IS NOT DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
	        'runtime-control-contract-audit-v1'||E'\n'
	        ||public.fn_property_task_projection_scalar_v1(audit.tenant_id,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.park_id,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.control_id::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.control_key,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_contract_hash,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_contract_hash,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_version::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_version::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_disabled_reason,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_disabled_reason,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(to_char(audit.old_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(to_char(audit.new_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n',
	        'UTF8'),'sha256'),'hex')) AS valid_194,
	    count(*) FILTER (WHERE signed.control_key IS NOT NULL
	      AND audit.correction_key='b2a-contract-correction-000195'
	      AND audit.old_contract_hash='81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3'
	      AND audit.new_contract_hash='e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944'
	      AND audit.new_contract_hash=control.contract_hash
	      AND audit.old_version=2
	      AND audit.new_version=3
	      AND audit.new_version=control.version
	      AND audit.old_disabled_reason='b2a-contract-correction-000194'
	      AND audit.new_disabled_reason='b2a-contract-correction-000195'
	      AND audit.new_disabled_reason=control.disabled_reason
	      AND audit.old_update_time IS NOT DISTINCT FROM (
	        SELECT prior.new_update_time
	        FROM public.sys_property_runtime_control_contract_audit prior
	        WHERE prior.tenant_id=audit.tenant_id AND prior.park_id=audit.park_id
	          AND prior.control_id=audit.control_id
	          AND prior.correction_key='b2a-contract-correction-000194')
	      AND audit.new_update_time=control.update_time
	      AND audit.occurred_at=control.update_time
	      AND audit.new_update_time>=audit.old_update_time
	      AND audit.evidence_hash IS NOT DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
	        'runtime-control-contract-audit-v2'||E'\n'
	        ||public.fn_property_task_projection_scalar_v1(audit.tenant_id,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.park_id,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.control_id::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.control_key,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.correction_key,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_contract_hash,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_contract_hash,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_version::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_version::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_disabled_reason,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_disabled_reason,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(to_char(audit.old_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(to_char(audit.new_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n',
	        'UTF8'),'sha256'),'hex')) AS valid_195
  FROM public.sys_property_runtime_control_contract_audit audit
  JOIN public.sys_property_runtime_control control
    ON control.tenant_id=audit.tenant_id
   AND control.park_id=audit.park_id
   AND control.id=audit.control_id
   AND control.control_key=audit.control_key
  LEFT JOIN signed ON signed.control_key=audit.control_key
  WHERE audit.correction_key IN ('b2a-contract-correction-000194','b2a-contract-correction-000195')
  GROUP BY audit.tenant_id, audit.park_id
), candidate AS (
  SELECT control_scope.tenant_id, control_scope.park_id,
    control_scope.actual AS controls,
    control_scope.valid AS valid_controls,
    coalesce(audit_scope.actual,0) AS audits,
    coalesce(audit_scope.valid_194,0) AS valid_audits_194,
    coalesce(audit_scope.valid_195,0) AS valid_audits_195,
    (SELECT count(*) FROM public.asset_park park
      WHERE park.tenant_id=control_scope.tenant_id AND park.park_id=control_scope.park_id
        AND park.is_deleted=false) AS live_asset_parks,
		    (SELECT count(*) FROM public.asset_park park
		      WHERE park.tenant_id=control_scope.tenant_id AND park.park_id=control_scope.park_id
		        AND park.is_deleted=true AND park.status='disabled') AS deleted_asset_parks,
	    (SELECT count(*) FROM public.biz_park park
	      WHERE park.tenant_id=control_scope.tenant_id AND park.park_id=control_scope.park_id
	        AND park.is_deleted=false) AS live_biz_parks,
	    (SELECT count(*) FROM public.biz_park park
	      WHERE park.tenant_id=control_scope.tenant_id AND park.park_id=control_scope.park_id
	        AND park.is_deleted=true) AS deleted_biz_parks,
	    (SELECT count(*) FROM public.rel_tenant_module assignment
	      JOIN public.sys_module module ON module.id=assignment.module_id
	      WHERE assignment.tenant_id=control_scope.tenant_id AND assignment.park_id=control_scope.park_id
        AND module.module_code='asset' AND module.is_deleted=false
        AND assignment.is_deleted=false) AS live_asset_assignments,
		    (SELECT count(*) FROM public.rel_tenant_module assignment
		      JOIN public.sys_module module ON module.id=assignment.module_id
		      WHERE assignment.tenant_id=control_scope.tenant_id AND assignment.park_id=control_scope.park_id
		        AND module.module_code='asset' AND module.is_deleted=false
		        AND assignment.is_deleted=true AND assignment.enabled=false AND assignment.status='disabled') AS deleted_asset_assignments
  FROM control_scope
  LEFT JOIN audit_scope USING (tenant_id, park_id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.rel_tenant_module assignment
    JOIN public.sys_module module ON module.id=assignment.module_id
    WHERE assignment.tenant_id=control_scope.tenant_id
      AND assignment.park_id=control_scope.park_id
      AND assignment.is_deleted=false
      AND module.module_code='asset'
      AND module.is_deleted=false
  )
), classified AS (
  SELECT CASE
	      WHEN controls=12 AND valid_controls=12
	       AND audits=24 AND valid_audits_194=12 AND valid_audits_195=12
	       AND live_asset_parks=0 AND deleted_asset_parks=1
	       AND live_biz_parks=0 AND deleted_biz_parks=1
	       AND live_asset_assignments=0 AND deleted_asset_assignments=1
	        THEN 'ready_restore_retired_owner'
      ELSE 'blocked_retired_owner_restore'
    END AS classification,
    tenant_id, park_id, controls, valid_controls, audits, valid_audits_194, valid_audits_195,
	    live_asset_parks, deleted_asset_parks, live_biz_parks, deleted_biz_parks,
	    live_asset_assignments, deleted_asset_assignments
  FROM candidate
)
SELECT * FROM classified
ORDER BY tenant_id, park_id;

COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$rows" >&2
  exit "$rc"
}

echo "000194 retired runtime owner repair diagnostic"
echo "classification|tenant_id|park_id|controls|valid_controls|audits|valid_audits_194|valid_audits_195|live_asset_parks|deleted_asset_parks|live_biz_parks|deleted_biz_parks|live_asset_assignments|deleted_asset_assignments"
printf '%s\n' "$rows"

blocked_count="$(printf '%s\n' "$rows" | awk -F '|' '
  NF >= 3 && $1 !~ /^ready_/ { count += 1 }
  END { print count + 0 }
')"
ready_count="$(printf '%s\n' "$rows" | awk -F '|' '
  NF >= 3 && $1 == "ready_restore_retired_owner" { count += 1 }
  END { print count + 0 }
')"
printf 'summary: ready=%s blocked=%s mode=%s\n' "$ready_count" "$blocked_count" "$mode"

if [ "$blocked_count" -ne 0 ]; then
  echo "ERROR: retired runtime owner repair has blocked candidates" >&2
  exit 3
fi

if [ "$mode" = "report" ] || [ "$ready_count" -eq 0 ]; then
  exit 0
fi

repair_output="$({
  run_psql <<'SQL'
BEGIN;
SET LOCAL search_path = public, pg_catalog;

WITH signed(control_key, control_kind, target, adapter_version) AS (VALUES
  ('identity.legacy-read-v1','compatibility_read','identity',1),
  ('identity.legacy-write-v1','compatibility_write','identity',1),
  ('identity.change-capture','change_capture','identity',NULL),
  ('identity.mutation-replay','mutation_replay','identity',NULL),
  ('identity.shadow-compare','shadow_compare','identity',NULL),
  ('identity.enforce','enforce','identity',NULL),
  ('approval.shadow-compare','shadow_compare','approval',NULL),
  ('approval.enforce','enforce','approval',NULL),
  ('event-notification.shadow-compare','shadow_compare','event_notification',NULL),
  ('event-notification.enforce','enforce','event_notification',NULL),
  ('task.shadow-compare','shadow_compare','task',NULL),
  ('task.enforce','enforce','task',NULL)
), control_scope AS (
  SELECT control.tenant_id, control.park_id,
    count(*) AS actual,
    count(*) FILTER (WHERE signed.control_key IS NOT NULL
      AND control.control_kind=signed.control_kind
      AND control.target=signed.target
      AND control.adapter_version IS NOT DISTINCT FROM signed.adapter_version
      AND control.contract_hash='e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944'::char(64)
      AND control.enabled=false
      AND control.control_mode='disabled'
      AND control.enabled_by IS NULL
      AND control.enabled_at IS NULL
      AND control.approval_reference IS NULL
      AND control.disabled_reason='b2a-contract-correction-000195'
      AND control.version=3) AS valid
  FROM public.sys_property_runtime_control control
  LEFT JOIN signed ON signed.control_key=control.control_key
  GROUP BY control.tenant_id, control.park_id
), audit_scope AS (
  SELECT audit.tenant_id, audit.park_id,
	    count(*) AS actual,
	    count(*) FILTER (WHERE signed.control_key IS NOT NULL
	      AND audit.correction_key='b2a-contract-correction-000194'
	      AND audit.old_contract_hash='a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8'
	      AND audit.new_contract_hash='81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3'
	      AND audit.old_version=1
	      AND audit.new_version=2
	      AND audit.old_disabled_reason='expand-only'
	      AND audit.new_disabled_reason='b2a-contract-correction-000194'
	      AND audit.new_update_time=audit.occurred_at
	      AND audit.new_update_time>=audit.old_update_time
	      AND audit.evidence_hash IS NOT DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
	        'runtime-control-contract-audit-v1'||E'\n'
	        ||public.fn_property_task_projection_scalar_v1(audit.tenant_id,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.park_id,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.control_id::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.control_key,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_contract_hash,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_contract_hash,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_version::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_version::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_disabled_reason,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_disabled_reason,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(to_char(audit.old_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(to_char(audit.new_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n',
	        'UTF8'),'sha256'),'hex')) AS valid_194,
	    count(*) FILTER (WHERE signed.control_key IS NOT NULL
	      AND audit.correction_key='b2a-contract-correction-000195'
	      AND audit.old_contract_hash='81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3'
	      AND audit.new_contract_hash='e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944'
	      AND audit.new_contract_hash=control.contract_hash
	      AND audit.old_version=2
	      AND audit.new_version=3
	      AND audit.new_version=control.version
	      AND audit.old_disabled_reason='b2a-contract-correction-000194'
	      AND audit.new_disabled_reason='b2a-contract-correction-000195'
	      AND audit.new_disabled_reason=control.disabled_reason
	      AND audit.old_update_time IS NOT DISTINCT FROM (
	        SELECT prior.new_update_time
	        FROM public.sys_property_runtime_control_contract_audit prior
	        WHERE prior.tenant_id=audit.tenant_id AND prior.park_id=audit.park_id
	          AND prior.control_id=audit.control_id
	          AND prior.correction_key='b2a-contract-correction-000194')
	      AND audit.new_update_time=control.update_time
	      AND audit.occurred_at=control.update_time
	      AND audit.new_update_time>=audit.old_update_time
	      AND audit.evidence_hash IS NOT DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
	        'runtime-control-contract-audit-v2'||E'\n'
	        ||public.fn_property_task_projection_scalar_v1(audit.tenant_id,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.park_id,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.control_id::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.control_key,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.correction_key,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_contract_hash,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_contract_hash,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_version::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_version::text,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.old_disabled_reason,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(audit.new_disabled_reason,'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(to_char(audit.old_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
	        ||public.fn_property_task_projection_scalar_v1(to_char(audit.new_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n',
	        'UTF8'),'sha256'),'hex')) AS valid_195
  FROM public.sys_property_runtime_control_contract_audit audit
  JOIN public.sys_property_runtime_control control
    ON control.tenant_id=audit.tenant_id
   AND control.park_id=audit.park_id
   AND control.id=audit.control_id
   AND control.control_key=audit.control_key
  LEFT JOIN signed ON signed.control_key=audit.control_key
  WHERE audit.correction_key IN ('b2a-contract-correction-000194','b2a-contract-correction-000195')
  GROUP BY audit.tenant_id, audit.park_id
), repair_scope AS (
  SELECT control_scope.tenant_id, control_scope.park_id
  FROM control_scope
  LEFT JOIN audit_scope USING (tenant_id, park_id)
  WHERE control_scope.actual=12 AND control_scope.valid=12
    AND coalesce(audit_scope.actual,0)=24
    AND coalesce(audit_scope.valid_194,0)=12
    AND coalesce(audit_scope.valid_195,0)=12
    AND (SELECT count(*) FROM public.asset_park park
      WHERE park.tenant_id=control_scope.tenant_id AND park.park_id=control_scope.park_id
        AND park.is_deleted=false)=0
		    AND (SELECT count(*) FROM public.asset_park park
		      WHERE park.tenant_id=control_scope.tenant_id AND park.park_id=control_scope.park_id
		        AND park.is_deleted=true AND park.status='disabled')=1
	    AND (SELECT count(*) FROM public.biz_park park
	      WHERE park.tenant_id=control_scope.tenant_id AND park.park_id=control_scope.park_id
	        AND park.is_deleted=false)=0
	    AND (SELECT count(*) FROM public.biz_park park
	      WHERE park.tenant_id=control_scope.tenant_id AND park.park_id=control_scope.park_id
	        AND park.is_deleted=true)=1
	    AND (SELECT count(*) FROM public.rel_tenant_module assignment
	      JOIN public.sys_module module ON module.id=assignment.module_id
      WHERE assignment.tenant_id=control_scope.tenant_id AND assignment.park_id=control_scope.park_id
        AND module.module_code='asset' AND module.is_deleted=false
        AND assignment.is_deleted=false)=0
    AND (SELECT count(*) FROM public.rel_tenant_module assignment
      JOIN public.sys_module module ON module.id=assignment.module_id
      WHERE assignment.tenant_id=control_scope.tenant_id AND assignment.park_id=control_scope.park_id
        AND module.module_code='asset' AND module.is_deleted=false
        AND assignment.is_deleted=true AND assignment.enabled=false AND assignment.status='disabled')=1
), restored_asset_park AS (
  UPDATE public.asset_park park
  SET is_deleted=false, status='enabled', update_time=clock_timestamp(), version=park.version+1
  FROM repair_scope scope
	  WHERE park.tenant_id=scope.tenant_id
	    AND park.park_id=scope.park_id
	    AND park.is_deleted=true
	    AND park.status='disabled'
  RETURNING park.tenant_id, park.park_id
), restored_assignment AS (
  UPDATE public.rel_tenant_module assignment
  SET is_deleted=false, enabled=false, status='disabled', update_time=clock_timestamp(), version=assignment.version+1
  FROM repair_scope scope, public.sys_module module
  WHERE assignment.tenant_id=scope.tenant_id
    AND assignment.park_id=scope.park_id
    AND assignment.module_id=module.id
	    AND module.module_code='asset'
	    AND module.is_deleted=false
	    AND assignment.is_deleted=true
	    AND assignment.enabled=false
	    AND assignment.status='disabled'
  RETURNING assignment.tenant_id, assignment.park_id
)
SELECT (SELECT count(*) FROM repair_scope),
       (SELECT count(*) FROM restored_asset_park),
       (SELECT count(*) FROM restored_assignment);

COMMIT;
SQL
} 2>&1)" || {
  rc=$?
  printf '%s\n' "$repair_output" >&2
  exit "$rc"
}

printf 'repair_result|scopes|asset_parks|asset_assignments\n%s\n' "$repair_output"
