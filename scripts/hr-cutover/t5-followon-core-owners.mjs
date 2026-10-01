import { canonicalT4, hashT4 } from "./production-import-t4-followon-binding.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const fail = code => { throw Object.assign(new Error(code), { code }); };

/** Exact source-code join is only a lookup. Ownership requires the succeeded
 * parent's T0 record, projection receipt, active map and scoped employee. */
export const T5_CORE_OWNER_SQL = `
SELECT e.employee_code, e.id::text employee_id,
       r.source_identity_sha256, r.source_row_sha256,
       m.id::text record_map_id, m.source_pk_canonical,
       (r.disposition='insert' AND r.rollback_status='not_started'
        AND m.source_system='yuzhou-v10' AND m.source_table='dbo.person'
        AND m.target_table='hr_employee' AND m.target_id=r.target_id
        AND m.source_identity_sha256=r.source_identity_sha256
        AND m.source_row_sha256=r.source_row_sha256
        AND m.source_pk_canonical='sha256:'||r.source_identity_sha256
        AND m.is_active AND m.mapping_status IN ('loaded','verified')
        AND NOT e.is_deleted AND e.tenant_id=$2 AND e.park_id=$3) valid
FROM hr_yuzhou_production_import_record r
LEFT JOIN hr_yuzhou_production_import_projection_receipt p
 ON p.operation_id=r.operation_id AND p.phase=r.phase
 AND p.source_identity_sha256=r.source_identity_sha256
LEFT JOIN legacy_record_map m ON m.id=p.legacy_record_map_id
 AND m.batch_id=p.migration_batch_id
LEFT JOIN hr_employee e ON e.id=r.target_id
WHERE r.operation_id=$1 AND r.phase='T0'
 AND r.target_table='hr_employee' AND r.disposition='insert'
ORDER BY r.source_identity_sha256`;

export function validateT5CoreOwnerRows(rows, expectedCount = 2938) {
  if (!Array.isArray(rows) || rows.length !== expectedCount) fail("T5_CORE_OWNER_COUNT_DRIFT");
  const byCode = new Map(), identities = new Set(), targets = new Set(), maps = new Set();
  for (const row of rows) {
    if (row.valid !== true || typeof row.employee_code !== "string" || !row.employee_code.length
      || !SHA.test(row.source_identity_sha256 ?? "") || !SHA.test(row.source_row_sha256 ?? "")
      || !UUID.test(row.employee_id ?? "") || !UUID.test(row.record_map_id ?? "")
      || row.source_pk_canonical !== `sha256:${row.source_identity_sha256}`
      || byCode.has(row.employee_code) || identities.has(row.source_identity_sha256)
      || targets.has(row.employee_id) || maps.has(row.record_map_id)) fail("T5_CORE_OWNER_MAP_DRIFT");
    byCode.set(row.employee_code, Object.freeze({ ...row }));
    identities.add(row.source_identity_sha256); targets.add(row.employee_id); maps.add(row.record_map_id);
  }
  return byCode;
}

export async function observeT5CoreOwners(client, binding, { lock = false } = {}) {
  const { parent, triple, targetScope } = binding;
  const result = await client.query(`SELECT operation_id,status,code_sha,source_snapshot_sha256,
    mapping_contract_sha256,sealed_plan_sha256,target_identity_sha256,target_scope_sha256,
    target_tenant_id,target_park_id,final_rehearsal_pair_sha256
    FROM hr_yuzhou_production_import_operation WHERE operation_id=$1${lock ? " FOR SHARE" : ""}`, [parent.operationId]);
  const op = result.rows?.[0];
  if (result.rows?.length !== 1 || op.status !== "succeeded" || op.code_sha !== triple.codeSha
    || op.source_snapshot_sha256 !== triple.sourceSnapshotHash || op.mapping_contract_sha256 !== triple.mappingContractHash
    || op.sealed_plan_sha256 !== parent.sealedPlanSha256 || op.target_identity_sha256 !== binding.targetIdentitySha256
    || op.target_scope_sha256 !== targetScope.scopeSha256 || op.target_tenant_id !== targetScope.tenantId
    || op.target_park_id !== targetScope.parkId || op.final_rehearsal_pair_sha256 !== binding.finalRehearsalPairSha256)
    fail("T5_CORE_PARENT_BINDING_DRIFT");
  const phases = (await client.query(`SELECT phase,status,planned_record_count,applied_record_count,payload_bundle_sha256
    FROM hr_yuzhou_production_import_phase WHERE operation_id=$1 ORDER BY phase`, [parent.operationId])).rows;
  if (canonicalT4(phases.map(row => row.phase)) !== canonicalT4(["T0", "T1", "T2", "T3"])
    || phases.some(row => row.status !== "succeeded" || String(row.planned_record_count) !== String(row.applied_record_count)
      || row.payload_bundle_sha256 !== parent.payloadBundleSha256[row.phase])) fail("T5_CORE_PARENT_PHASE_DRIFT");
  const observed = (await client.query(`SELECT count(*)::text count,
    count(*) FILTER(WHERE r.rollback_status<>'not_started' OR m.id IS NULL OR NOT m.is_active
      OR m.source_identity_sha256<>r.source_identity_sha256 OR m.source_row_sha256<>r.source_row_sha256
      OR m.target_id IS DISTINCT FROM r.target_id
      OR (r.target_table='hr_employee' AND (e.id IS NULL OR e.tenant_id<>$2 OR e.park_id<>$3 OR e.is_deleted)))::text invalid,
    encode(digest(COALESCE(string_agg(encode(digest(jsonb_build_object('record',to_jsonb(r),'map',to_jsonb(m),'employee',to_jsonb(e))::text,'sha256'),'hex'),'' ORDER BY r.phase,r.source_identity_sha256),''),'sha256'),'hex') sha256
    FROM hr_yuzhou_production_import_record r
    LEFT JOIN hr_yuzhou_production_import_projection_receipt p USING(operation_id,phase,source_identity_sha256)
    LEFT JOIN legacy_record_map m ON m.id=p.legacy_record_map_id
    LEFT JOIN hr_employee e ON r.target_table='hr_employee' AND e.id=r.target_id
    WHERE r.operation_id=$1`, [parent.operationId, targetScope.tenantId, targetScope.parkId])).rows[0];
  if (observed.invalid !== "0" || observed.sha256 !== parent.recordSetSha256
    || BigInt(observed.count) !== phases.reduce((sum, row) => sum + BigInt(row.applied_record_count), 0n))
    fail("T5_CORE_PARENT_RECORD_SET_DRIFT");
  const rows = (await client.query(T5_CORE_OWNER_SQL, [parent.operationId, targetScope.tenantId, targetScope.parkId])).rows;
  const byCode = validateT5CoreOwnerRows(rows);
  return { byCode, employeeIndex: rows.map(row => ({ employeeCode: row.employee_code,
    sourceIdentitySha256: row.source_identity_sha256 })),
    receipt: { status: "ACTUAL_CORE_T0_OWNER_MAP_VERIFIED", employees: rows.length,
      ownerSetSha256: hashT4(canonicalT4(rows)), productionBusinessWrites: 0 } };
}

/** Preserve every authenticated source row, including unresolved historical
 * people and ownerless dictionaries/documents. No name or trimmed-code guess. */
export function classifyT5FullArchiveOwners(records, byCode) {
  if (!Array.isArray(records) || !(byCode instanceof Map)) fail("T5_ARCHIVE_OWNER_INPUT_INVALID");
  const counts = { source: records.length, mapped: 0, unmapped: 0, notApplicable: 0 }, seen = new Set();
  const classified = records.map(record => {
    if (!SHA.test(record.sourceIdentitySha256 ?? "") || !SHA.test(record.sourceRowSha256 ?? "")
      || typeof record.sourceTable !== "string") fail("T5_ARCHIVE_SOURCE_IDENTITY_INVALID");
    const key = `${record.sourceTable}:${record.sourceIdentitySha256}`;
    if (seen.has(key)) fail("T5_ARCHIVE_SOURCE_IDENTITY_DUPLICATE");
    seen.add(key);
    const code = record.employeeCode;
    if (code !== undefined && code !== null && typeof code !== "string") fail("T5_ARCHIVE_EMPLOYEE_CODE_INVALID");
    const owner = code ? byCode.get(code) : null;
    const mappingStatus = owner ? "mapped" : code ? "unmapped" : "notApplicable";
    counts[mappingStatus] += 1;
    return { record, mappingStatus, owner: owner ?? null };
  });
  return { classified, counts };
}
