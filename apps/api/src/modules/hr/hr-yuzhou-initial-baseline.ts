import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";
import { canonicalYuzhouInitialJson, YUZHOU_INITIAL_CANONICALIZATION, YUZHOU_INITIAL_PROJECTION_FIELDS, type TenantParkScope, type YuzhouIncrementalItem, type YuzhouInitialBaselineWitness } from "@jinhu/shared";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const canonicalOriginal = (value: unknown) => {
  try { return canonicalYuzhouInitialJson(value); }
  catch { throw new BadRequestException("INITIAL_BASELINE_CANONICAL_VALUE_INVALID"); }
};
export const initialWitnessHash = (witness: YuzhouInitialBaselineWitness) => {
  const { version, operationId, phase, canonicalizationVersion, targetId, projection } = witness;
  const envelope = { version, operationId, phase, canonicalizationVersion, targetId, projection };
  if (JSON.stringify(Object.keys(witness).sort()) !== JSON.stringify(Object.keys(envelope).sort())) throw new BadRequestException("INITIAL_BASELINE_WITNESS_KEYS_INVALID");
  // DTO instances are not canonical JSON objects; only this explicit required envelope is.
  return hash(canonicalOriginal(envelope));
};
const reject = (): never => { throw new ConflictException("INITIAL_BASELINE_ORIGINAL_EVIDENCE_INVALID"); };
type Receipt = { operation_id: string; phase: string; source_table: string; source_pk_canonical: string; source_identity_sha256: string; target_table: string; target_id: string; target_after_sha256: string; target_version_after: number; source_row_sha256: string };

/** Exact record -> projection receipt -> batch -> active map, all held through commit. */
async function originalReceipt(manager: EntityManager, scope: TenantParkScope, operationId: string, phase: string, identity: string): Promise<Receipt> {
  const rows = await manager.query(`
    SELECT r.* FROM hr_yuzhou_production_import_record r
    JOIN hr_yuzhou_production_import_operation o ON o.operation_id=r.operation_id
    JOIN hr_yuzhou_production_import_phase p ON (p.operation_id,p.phase)=(r.operation_id,r.phase)
    JOIN hr_yuzhou_production_import_projection_receipt pr ON (pr.operation_id,pr.phase,pr.source_identity_sha256)=(r.operation_id,r.phase,r.source_identity_sha256)
    JOIN migration_batch b ON b.id=pr.migration_batch_id
    JOIN legacy_record_map m ON m.id=pr.legacy_record_map_id AND m.batch_id=b.id
    WHERE r.operation_id=$1 AND r.phase=$2 AND r.source_identity_sha256=$3
      AND o.status='succeeded' AND o.execution_contract_version=2
      AND o.target_tenant_id=$4 AND o.target_park_id=$5 AND o.target_scope_sha256=$6
      AND p.status='succeeded' AND p.canonicalization_version=$7
      AND p.payload_bundle_artifact_sha256 IS NOT NULL AND p.payload_bundle_sha256 IS NOT NULL
      AND r.rollback_status='not_started' AND r.rolled_back_at IS NULL
      AND r.disposition IN ('insert','merge','skip_approved') AND r.target_version_after>=1
      AND r.target_after_sha256 IS NOT NULL AND r.target_table=r.planned_target_table
      AND r.source_system='yuzhou-v10' AND r.source_pk_canonical='sha256:'||r.source_identity_sha256
      AND b.execution_context='production_import' AND b.status='succeeded'
      AND b.production_import_operation_id=r.operation_id AND b.production_import_phase=r.phase
      AND b.source_system=r.source_system AND b.source_snapshot_sha256=o.source_snapshot_sha256
      AND b.target_database=current_database() AND b.run_id=r.operation_id||'-'||lower(r.phase)
      AND b.tool_version='prod-import-v2@'||o.code_sha
      AND m.source_system=r.source_system AND m.source_table=r.source_table
      AND m.source_pk_canonical=r.source_pk_canonical AND m.source_identity_sha256=r.source_identity_sha256
      AND m.source_row_sha256=r.source_row_sha256 AND m.target_table=r.target_table AND m.target_id=r.target_id
      AND m.is_active=true AND m.mapping_status IN ('loaded','verified')
    FOR SHARE OF r,o,p,pr,b,m`, [operationId,phase,identity,scope.tenantId,scope.parkId,
    hash(`yuzhou-hr-production-target-scope-v1\0${scope.tenantId}\0${scope.parkId}`),YUZHOU_INITIAL_CANONICALIZATION]) as Receipt[];
  if (rows.length !== 1) return reject();
  const row = rows[0]!;
  // Do not pick one successful receipt out of an ambiguous active source binding.
  const maps = await manager.query(`SELECT id FROM legacy_record_map WHERE source_system='yuzhou-v10' AND source_table=$1 AND source_identity_sha256=$2 AND is_active=true FOR SHARE`, [row.source_table, identity]);
  if (maps.length !== 1) return reject();
  return row;
}

export async function verifyYuzhouInitialBaseline(manager: EntityManager, scope: TenantParkScope, item: YuzhouIncrementalItem, witness: YuzhouInitialBaselineWitness) {
  if (item.domain === "profile") throw new BadRequestException("INITIAL_BASELINE_PROFILE_PROOF_UNAVAILABLE");
  const table = item.domain === "employee" ? "hr_employee" : "hr_contract";
  const phase = item.domain === "employee" ? "T0" : "T2";
  const projection = witness.projection;
  if (witness.version !== 1 || witness.phase !== phase || witness.canonicalizationVersion !== YUZHOU_INITIAL_CANONICALIZATION
    || !projection || typeof projection !== "object" || Array.isArray(projection)
    || JSON.stringify(Object.keys(projection).sort()) !== JSON.stringify([...YUZHOU_INITIAL_PROJECTION_FIELDS[table]].sort())
    || projection.tenant_id !== scope.tenantId || projection.park_id !== scope.parkId) return reject();
  const receipt = await originalReceipt(manager,scope,witness.operationId,phase,item.sourceKey.slice(7));
  if (receipt.source_table !== item.sourceTable || receipt.source_pk_canonical !== item.sourceKey || receipt.target_table !== table || receipt.target_id !== witness.targetId) return reject();
  const targetHash = hash(`yuzhou-hr-production-target-canonical-sha256-v1\0${table}\0${canonicalOriginal(projection)}`);
  if (targetHash !== receipt.target_after_sha256) return reject();
  const rules = table === "hr_employee"
    ? [{ role:"primary_org",column:"primary_org_id",table:"sys_org",phase:"T0",required:true },{ role:"position",column:"position_id",table:"hr_position",phase:"T0",required:false }]
    : [{ role:"employee",column:"employee_id",table:"hr_employee",phase:"T0",required:true },{ role:"contract_type",column:"contract_type_id",table:"hr_contract_type",phase:"T2",required:true }];
  const dependencies = await manager.query(`SELECT * FROM hr_yuzhou_production_import_record_dependency WHERE operation_id=$1 AND phase=$2 AND source_identity_sha256=$3 FOR SHARE`, [witness.operationId,phase,receipt.source_identity_sha256]) as Array<{dependency_role:string;depends_on_phase:string;depends_on_source_identity_sha256:string;expected_target_table:string}>;
  const dependencyReceipts = new Map<string,Receipt>();
  if (dependencies.some(d => !rules.some(rule => rule.role === d.dependency_role))) return reject();
  for (const rule of rules) {
    const matches = dependencies.filter(d => d.dependency_role === rule.role);
    if (matches.length === 0 && !rule.required && projection[rule.column] === null) continue;
    if (matches.length !== 1 || matches[0]!.expected_target_table !== rule.table || matches[0]!.depends_on_phase !== rule.phase) return reject();
    const dep = await originalReceipt(manager,scope,witness.operationId,rule.phase,matches[0]!.depends_on_source_identity_sha256);
    if (dep.target_table !== rule.table || dep.target_id !== projection[rule.column]) return reject();
    dependencyReceipts.set(rule.role,dep);
  }
  const columns: Record<string,string> = table === "hr_employee"
    ? {employeeCode:"employee_code",fullName:"full_name",employmentType:"employment_type",employmentStatus:"employment_status",hireDate:"hire_date",workLocation:"work_location",workMobile:"work_mobile",workEmail:"work_email"}
    : {contractNo:"contract_no",startDate:"start_date",endDate:"end_date",probationEndDate:"probation_end_date",workType:"work_type",positionTitle:"position_title"};
  const target = Object.fromEntries(Object.entries(columns).map(([field,column]) => [field,projection[column]]));
  const source = { ...target };
  if (table === "hr_contract") {
    const employee = dependencyReceipts.get("employee")!;
    if (projection.legacy_source_identity_sha256 !== receipt.source_identity_sha256 || projection.legacy_source_row_sha256 !== receipt.source_row_sha256) return reject();
    Object.assign(source,{employeeSourceKey:employee.source_pk_canonical,employeeSourceTable:employee.source_table,contractTypeId:projection.contract_type_id,contractStatus:projection.status});
  }
  return { receipt, source, target, witnessSha256:initialWitnessHash(witness) };
}
