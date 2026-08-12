import { ConflictException } from "@nestjs/common";
import { TRACK_B_CONTRACT_SHA256, type TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";

const EXPAND_CONTRACT_SHA256 = "a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8";
const CORRECTION_000194_SHA256 = "81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3";
const CORRECTION_000194 = "b2a-contract-correction-000194";
const CORRECTION_000195 = "b2a-contract-correction-000195";

export const TENANT_ASSET_RUNTIME_CONTROLS = [
  { controlKey: "identity.legacy-read-v1", controlKind: "compatibility_read", target: "identity", adapterVersion: 1 },
  { controlKey: "identity.legacy-write-v1", controlKind: "compatibility_write", target: "identity", adapterVersion: 1 },
  { controlKey: "identity.change-capture", controlKind: "change_capture", target: "identity", adapterVersion: null },
  { controlKey: "identity.mutation-replay", controlKind: "mutation_replay", target: "identity", adapterVersion: null },
  { controlKey: "identity.shadow-compare", controlKind: "shadow_compare", target: "identity", adapterVersion: null },
  { controlKey: "identity.enforce", controlKind: "enforce", target: "identity", adapterVersion: null },
  { controlKey: "approval.shadow-compare", controlKind: "shadow_compare", target: "approval", adapterVersion: null },
  { controlKey: "approval.enforce", controlKind: "enforce", target: "approval", adapterVersion: null },
  { controlKey: "event-notification.shadow-compare", controlKind: "shadow_compare", target: "event_notification", adapterVersion: null },
  { controlKey: "event-notification.enforce", controlKind: "enforce", target: "event_notification", adapterVersion: null },
  { controlKey: "task.shadow-compare", controlKind: "shadow_compare", target: "task", adapterVersion: null },
  { controlKey: "task.enforce", controlKind: "enforce", target: "task", adapterVersion: null }
] as const;

interface RuntimeControlState {
  controlCount: string;
  validControlCount: string;
  auditCount: string;
  validAuditCount: string;
}

const manifestJson = JSON.stringify(TENANT_ASSET_RUNTIME_CONTROLS);

async function loadRuntimeControlState(manager: EntityManager, scope: TenantParkScope): Promise<RuntimeControlState> {
  const rows = typeormQueryRows<RuntimeControlState>(await manager.query(
    `WITH signed AS (
       SELECT * FROM jsonb_to_recordset($3::jsonb) AS definition(
         "controlKey" text,"controlKind" text,target text,"adapterVersion" integer)
     ), control_state AS (
       SELECT count(*) AS control_count,
         count(*) FILTER (WHERE signed."controlKey" IS NOT NULL
           AND control.control_kind=signed."controlKind"
           AND control.target=signed.target
           AND control.adapter_version IS NOT DISTINCT FROM signed."adapterVersion"
           AND control.contract_hash=$4::char(64)
           AND control.enabled=false AND control.control_mode='disabled'
           AND control.enabled_by IS NULL AND control.enabled_at IS NULL
           AND control.approval_reference IS NULL
           AND control.disabled_reason=$6 AND control.version=3) AS valid_control_count
       FROM public.sys_property_runtime_control control
       LEFT JOIN signed ON signed."controlKey"=control.control_key
       WHERE control.tenant_id=$1 AND control.park_id=$2
     ), audit_state AS (
       SELECT count(*) AS audit_count,
         count(*) FILTER (WHERE
           signed."controlKey" IS NOT NULL
           AND audit.control_key=control.control_key
           AND audit.control_id=control.id
           AND ((audit.correction_key=$5
             AND audit.old_contract_hash=$7::char(64)
             AND audit.new_contract_hash=$8::char(64)
             AND audit.old_version=1 AND audit.new_version=2
             AND audit.old_disabled_reason='expand-only'
             AND audit.new_disabled_reason=$5
             AND audit.evidence_hash IS NOT DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
               'runtime-control-contract-audit-v1'||E'\\n'
               ||public.fn_property_task_projection_scalar_v1(audit.tenant_id,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.park_id,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.control_id::text,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.control_key,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.old_contract_hash,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.new_contract_hash,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.old_version::text,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.new_version::text,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.old_disabled_reason,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.new_disabled_reason,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(to_char(audit.old_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(to_char(audit.new_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\\n','UTF8'),'sha256'),'hex'))
           OR (audit.correction_key=$6
             AND audit.old_contract_hash=$8::char(64)
             AND audit.new_contract_hash=$4::char(64)
             AND audit.old_version=2 AND audit.new_version=3
             AND audit.old_disabled_reason=$5 AND audit.new_disabled_reason=$6
             AND audit.evidence_hash IS NOT DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
               'runtime-control-contract-audit-v2'||E'\\n'
               ||public.fn_property_task_projection_scalar_v1(audit.tenant_id,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.park_id,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.control_id::text,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.control_key,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.correction_key,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.old_contract_hash,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.new_contract_hash,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.old_version::text,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.new_version::text,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.old_disabled_reason,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(audit.new_disabled_reason,'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(to_char(audit.old_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\\t'
               ||public.fn_property_task_projection_scalar_v1(to_char(audit.new_update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\\n','UTF8'),'sha256'),'hex')))
         ) AS valid_audit_count
       FROM public.sys_property_runtime_control_contract_audit audit
       LEFT JOIN signed ON signed."controlKey"=audit.control_key
       LEFT JOIN public.sys_property_runtime_control control
         ON control.tenant_id=audit.tenant_id AND control.park_id=audit.park_id
        AND control.id=audit.control_id
       WHERE audit.tenant_id=$1 AND audit.park_id=$2
         AND audit.correction_key IN ($5,$6)
     )
     SELECT control_count::text AS "controlCount",
       valid_control_count::text AS "validControlCount",
       audit_count::text AS "auditCount",
       valid_audit_count::text AS "validAuditCount"
     FROM control_state CROSS JOIN audit_state`,
    [scope.tenantId, scope.parkId, manifestJson, TRACK_B_CONTRACT_SHA256,
      CORRECTION_000194, CORRECTION_000195, EXPAND_CONTRACT_SHA256, CORRECTION_000194_SHA256]
  ));
  const [state] = rows;
  if (!state) throw new ConflictException("Asset runtime control state could not be verified");
  return state;
}

async function applyCorrection(
  manager: EntityManager,
  scope: TenantParkScope,
  input: { oldHash: string; newHash: string; oldReason: string; newReason: string; oldVersion: number; newVersion: number }
): Promise<void> {
  const rows = typeormQueryRows<{ changedCount: string; auditCount: string }>(await manager.query(
    `WITH changed_at AS (SELECT clock_timestamp() AS value),
     before_change AS MATERIALIZED (
       SELECT control.* FROM public.sys_property_runtime_control control
       WHERE control.tenant_id=$1 AND control.park_id=$2
         AND control.contract_hash=$3::char(64)
         AND control.disabled_reason=$5 AND control.version=$7
       ORDER BY control.control_key,control.id FOR UPDATE
     ), changed AS (
       UPDATE public.sys_property_runtime_control control
       SET contract_hash=$4::char(64),disabled_reason=$6,version=$8,
         update_time=changed_at.value
       FROM before_change prior CROSS JOIN changed_at
       WHERE control.id=prior.id
       RETURNING control.*,prior.contract_hash AS old_hash,
         prior.disabled_reason AS old_reason,prior.version AS old_version,
         prior.update_time AS old_time
     ), inserted AS (
       INSERT INTO public.sys_property_runtime_control_contract_audit (
         tenant_id,park_id,control_id,control_key,correction_key,
         old_contract_hash,new_contract_hash,old_version,new_version,
         old_disabled_reason,new_disabled_reason,old_update_time,new_update_time,
         evidence_hash,occurred_at)
       SELECT tenant_id,park_id,id,control_key,$6,old_hash,contract_hash,
         old_version,version,old_reason,disabled_reason,old_time,update_time,
         encode(public.digest(pg_catalog.convert_to(
           CASE WHEN $6=$9 THEN 'runtime-control-contract-audit-v1'||E'\\n'
             ||public.fn_property_task_projection_scalar_v1(tenant_id,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(park_id,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(id::text,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(control_key,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(old_hash,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(contract_hash,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(old_version::text,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(version::text,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(old_reason,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(disabled_reason,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(to_char(old_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(to_char(update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\\n'
           ELSE 'runtime-control-contract-audit-v2'||E'\\n'
             ||public.fn_property_task_projection_scalar_v1(tenant_id,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(park_id,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(id::text,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(control_key,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1($6,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(old_hash,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(contract_hash,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(old_version::text,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(version::text,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(old_reason,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(disabled_reason,'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(to_char(old_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\\t'
             ||public.fn_property_task_projection_scalar_v1(to_char(update_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\\n'
           END,'UTF8'),'sha256'),'hex'),update_time
       FROM changed RETURNING 1
     )
     SELECT (SELECT count(*) FROM changed)::text AS "changedCount",
       (SELECT count(*) FROM inserted)::text AS "auditCount"`,
    [scope.tenantId, scope.parkId, input.oldHash, input.newHash, input.oldReason, input.newReason,
      input.oldVersion, input.newVersion, CORRECTION_000194]
  ));
  const [result] = rows;
  if (Number(result?.changedCount) !== TENANT_ASSET_RUNTIME_CONTROLS.length ||
      Number(result?.auditCount) !== TENANT_ASSET_RUNTIME_CONTROLS.length) {
    throw new ConflictException("Asset runtime control correction was incomplete");
  }
}

export async function ensureTenantAssetRuntimeControls(
  manager: EntityManager,
  scope: TenantParkScope
): Promise<void> {
  const state = await loadRuntimeControlState(manager, scope);
  const expectedControls = TENANT_ASSET_RUNTIME_CONTROLS.length;
  if (Number(state.controlCount) === expectedControls &&
      Number(state.validControlCount) === expectedControls &&
      Number(state.auditCount) === expectedControls * 2 &&
      Number(state.validAuditCount) === expectedControls * 2) return;
  if (Number(state.controlCount) !== 0 || Number(state.auditCount) !== 0) {
    throw new ConflictException("Asset runtime control state is partial or inconsistent");
  }

  await manager.query(
    `WITH signed AS (
       SELECT * FROM jsonb_to_recordset($3::jsonb) AS definition(
         "controlKey" text,"controlKind" text,target text,"adapterVersion" integer)
     )
     INSERT INTO public.sys_property_runtime_control (
       tenant_id,park_id,control_key,control_kind,target,adapter_version,
       contract_hash,enabled,control_mode,enabled_by,enabled_at,
       approval_reference,disabled_reason,version)
     SELECT $1,$2,"controlKey","controlKind",target,"adapterVersion",
       $4::char(64),false,'disabled',NULL,NULL,NULL,'expand-only',1 FROM signed`,
    [scope.tenantId, scope.parkId, manifestJson, EXPAND_CONTRACT_SHA256]
  );
  await applyCorrection(manager, scope, {
    oldHash: EXPAND_CONTRACT_SHA256,
    newHash: CORRECTION_000194_SHA256,
    oldReason: "expand-only",
    newReason: CORRECTION_000194,
    oldVersion: 1,
    newVersion: 2
  });
  await applyCorrection(manager, scope, {
    oldHash: CORRECTION_000194_SHA256,
    newHash: TRACK_B_CONTRACT_SHA256,
    oldReason: CORRECTION_000194,
    newReason: CORRECTION_000195,
    oldVersion: 2,
    newVersion: 3
  });

  const finalState = await loadRuntimeControlState(manager, scope);
  if (Number(finalState.controlCount) !== expectedControls ||
      Number(finalState.validControlCount) !== expectedControls ||
      Number(finalState.auditCount) !== expectedControls * 2 ||
      Number(finalState.validAuditCount) !== expectedControls * 2) {
    throw new ConflictException("Asset runtime control postcondition failed");
  }
}
