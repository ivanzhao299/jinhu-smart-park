import { createHash } from "node:crypto";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const TABLES = Object.freeze({
  hr_employee_profile: Object.freeze({ fields: ["id_type", "id_number_encrypted", "id_number_masked", "id_number_fingerprint", "gender", "date_of_birth", "ethnicity", "native_place", "political_status", "marital_status", "health_status", "address", "home_phone", "personal_mobile", "personal_email", "highest_education", "major", "degree", "graduation_school", "graduation_date", "foreign_language", "job_title", "job_grade", "legacy_source_identity_sha256", "legacy_source_row_sha256"], dates: new Set(["date_of_birth", "graduation_date"]) }),
  hr_employee_family: Object.freeze({ fields: ["relationship", "full_name_encrypted", "full_name_masked", "full_name_fingerprint", "contact_encrypted", "contact_masked", "contact_fingerprint", "birth_date", "work_unit", "job_title", "political_status", "legacy_source_identity_sha256", "legacy_source_row_sha256"], dates: new Set(["birth_date"]) }),
  hr_employee_skill: Object.freeze({ fields: ["skill_name", "proficiency", "legacy_grade", "note", "legacy_source_identity_sha256", "legacy_source_row_sha256"], dates: new Set() }),
  hr_employee_credential: Object.freeze({ fields: ["credential_type", "credential_name", "number_encrypted", "number_masked", "number_fingerprint", "issuing_authority", "acquired_date", "valid_to", "note", "legacy_file_reference_sha256", "legacy_source_identity_sha256", "legacy_source_row_sha256"], dates: new Set(["acquired_date", "valid_to"]) }),
});

export class ProductionImportT5NonfileWriterError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportT5NonfileWriterError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionImportT5NonfileWriterError(code, detail); };
const hash = value => createHash("sha256").update(value).digest("hex");
const canonicalJson = value => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, required, optional, label) => {
  if (!object(value)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.has(key))) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `${label} keys differ`);
};
const rows = (result, label) => {
  if (!result || !Array.isArray(result.rows)) fail("PRODUCTION_IMPORT_T5_NONFILE_DATABASE_RESULT_INVALID", `${label} returned no rows`);
  return result.rows;
};

function deriveTargetId(targetScope, targetTable, sourceIdentitySha256) {
  const bytes = Buffer.from(hash(`yuzhou-hr-production-target-id-sha256-v1\0${targetScope.scopeSha256}\0${targetTable}\0${sourceIdentitySha256}`), "hex").subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function businessIdentity(targetScope, targetTable, sourceIdentitySha256) {
  return hash(`yuzhou-hr-production-t5-business-identity-v1\0${targetScope.scopeSha256}\0${targetTable}\0${sourceIdentitySha256}`);
}

function targetAfter(targetScope, targetTable, targetId, sourceRowSha256) {
  return hash(`yuzhou-hr-production-t5-target-after-v1\0${targetScope.scopeSha256}\0${targetTable}\0${targetId}\0${sourceRowSha256}`);
}

export function computeT5NonfileAfterCanonicalSha256(targetScope, resultRecords) {
  return hash(`yuzhou-hr-production-t5-after-canonical-v1\0${targetScope.scopeSha256}\0${canonicalJson(resultRecords.map(record => ({
    sourceIdentitySha256: record.sourceIdentitySha256,
    disposition: record.disposition,
    targetTable: record.targetTable,
    targetId: record.targetId ?? null,
    targetAfterSha256: record.targetAfterSha256 ?? null,
  })).sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256)))}`);
}

function validateInput(input) {
  exactKeys(input, ["tx", "operationId", "targetScope", "actorId", "privateStage"], [], "input");
  if (!input.tx || typeof input.tx.query !== "function" || !OPERATION_ID.test(input.operationId ?? "") || !UUID.test(input.actorId ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "transaction, operation, or actor invalid");
  exactKeys(input.targetScope, ["tenantId", "parkId", "scopeSha256"], [], "target scope");
  if (typeof input.targetScope.tenantId !== "string" || typeof input.targetScope.parkId !== "string" || !SHA256.test(input.targetScope.scopeSha256 ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "target scope invalid");
  exactKeys(input.privateStage, ["formatVersion", "artifactKind", "phase", "triple", "sourceSnapshotHash", "sourceRestoreReceiptSha256", "sourceBusinessSha256", "records", "productionImport"], [], "private stage");
  if (input.privateStage.formatVersion !== 1 || input.privateStage.artifactKind !== "yuzhou_hr_production_import_t5_nonfile_private_payload_stage" || input.privateStage.phase !== "T5" || input.privateStage.productionImport !== "HOLD" || !Array.isArray(input.privateStage.records) || !SHA256.test(input.privateStage.sourceSnapshotHash ?? "") || !SHA256.test(input.privateStage.sourceRestoreReceiptSha256 ?? "") || !SHA256.test(input.privateStage.sourceBusinessSha256 ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "private stage invalid");
  exactKeys(input.privateStage.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], "private stage triple");
  if (!/^[0-9a-f]{40}$/u.test(input.privateStage.triple.codeSha ?? "") || !SHA256.test(input.privateStage.triple.sourceSnapshotHash ?? "") || !SHA256.test(input.privateStage.triple.mappingContractHash ?? "") || input.privateStage.triple.sourceSnapshotHash !== input.privateStage.sourceSnapshotHash) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "private stage triple invalid");
}

function validateRecords(recordsInput) {
  const seen = new Set();
  return recordsInput.map((record, index) => {
    exactKeys(record, ["sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256", "targetTable", "dependencyMode", "dependencyRefs", "disposition"], ["payload", "quarantineReason"], `private stage record ${index}`);
    if (record.sourceSystem !== "yuzhou-v10" || !TABLES[record.targetTable] || record.dependencyMode !== "employee" || !SHA256.test(record.sourceIdentitySha256 ?? "") || !SHA256.test(record.sourceRowSha256 ?? "") || record.sourcePkCanonical !== `sha256:${record.sourceIdentitySha256}` || !["insert", "quarantine"].includes(record.disposition) || seen.has(record.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} invalid`);
    seen.add(record.sourceIdentitySha256);
    if (record.disposition === "insert") {
      if (!object(record.payload) || Object.hasOwn(record, "quarantineReason") || !Array.isArray(record.dependencyRefs) || record.dependencyRefs.length !== 1) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `insert ${index} invalid`);
      const dependency = record.dependencyRefs[0];
      exactKeys(dependency, ["role", "phase", "expectedTargetTable", "sourceIdentitySha256"], [], `insert ${index} dependency`);
      if (dependency.role !== "employee" || dependency.phase !== "T0" || dependency.expectedTargetTable !== "hr_employee" || !SHA256.test(dependency.sourceIdentitySha256 ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `insert ${index} dependency invalid`);
      const expected = TABLES[record.targetTable].fields;
      if (JSON.stringify(Object.keys(record.payload).sort()) !== JSON.stringify([...expected].sort())) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `insert ${index} payload fields differ`);
    } else if (Object.hasOwn(record, "payload") || typeof record.quarantineReason !== "string" || record.quarantineReason.length === 0 || !Array.isArray(record.dependencyRefs) || record.dependencyRefs.length > 1) {
      fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `quarantine ${index} invalid`);
    }
    return structuredClone(record);
  });
}

async function resolveEmployees(tx, operationId, records) {
  const sourceIdentities = [...new Set(records.filter(record => record.disposition === "insert").map(record => record.dependencyRefs[0].sourceIdentitySha256))];
  if (sourceIdentities.length === 0) return new Map();
  const result = rows(await tx.query(
    `/* hr-prod-t5:resolve-employees */
     SELECT map.source_identity_sha256,map.target_id::text AS employee_id
     FROM legacy_record_map map
     JOIN migration_batch batch ON batch.id=map.batch_id
     WHERE batch.execution_context='production_import'
       AND batch.production_import_operation_id=$1
       AND batch.production_import_phase='T0'
       AND batch.status='succeeded'
       AND map.target_table='hr_employee'
       AND map.mapping_status IN ('loaded','verified')
       AND map.is_active=true
       AND map.source_identity_sha256=ANY($2::char(64)[])`,
    [operationId, sourceIdentities],
  ), "resolve employees");
  const resolved = new Map(result.map(row => [row.source_identity_sha256, row.employee_id]));
  if (resolved.size !== sourceIdentities.length || [...resolved.values()].some(value => !UUID.test(value ?? ""))) fail("PRODUCTION_IMPORT_T5_NONFILE_EMPLOYEE_MAP_REQUIRED", "every T5 insert must bind exactly one T0 employee");
  return resolved;
}

async function createBatch(tx, operationId, sourceSnapshotHash) {
  const result = rows(await tx.query(
    `/* hr-prod-t5:create-batch */
     INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,counts,started_at,execution_context,production_import_operation_id,production_import_phase)
     SELECT operation_id||'-t5','yuzhou-v10',source_snapshot_sha256,current_database(),'load','running','prod-import-v2@'||code_sha,'{}'::jsonb,now(),'production_import',operation_id,'T5'
     FROM hr_yuzhou_production_import_operation
     WHERE operation_id=$1 AND execution_contract_version=2 AND status='running'
       AND current_phase='T5' AND source_snapshot_sha256=$2
     RETURNING id::text`,
    [operationId, sourceSnapshotHash],
  ), "create T5 migration batch");
  if (result.length !== 1 || !UUID.test(result[0].id ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_DATABASE_RESULT_INVALID", "T5 batch unavailable");
  return result[0].id;
}

function selectExpression(field, dates) {
  return dates.has(field) ? `NULLIF(src.payload->>'${field}','')::date` : `src.payload->>'${field}'`;
}

async function insertTable(tx, table, config, targetScope, actorId, rowsInput, employees) {
  if (rowsInput.length === 0) return [];
  const prepared = rowsInput.map(record => ({ id: deriveTargetId(targetScope, table, record.sourceIdentitySha256), employee_id: employees.get(record.dependencyRefs[0].sourceIdentitySha256), payload: record.payload, source_identity_sha256: record.sourceIdentitySha256 }));
  if (prepared.some(row => !UUID.test(row.id) || !UUID.test(row.employee_id ?? ""))) fail("PRODUCTION_IMPORT_T5_NONFILE_EMPLOYEE_MAP_REQUIRED", `${table} employee binding missing`);
  const columns = ["id", "tenant_id", "park_id", "employee_id", ...config.fields, "create_by", "update_by"];
  const values = ["src.id::uuid", "$1", "$2", "src.employee_id::uuid", ...config.fields.map(field => selectExpression(field, config.dates)), "$3::uuid", "$3::uuid"];
  const result = rows(await tx.query(
    `/* hr-prod-t5:insert:${table} */
     WITH src AS (SELECT * FROM jsonb_to_recordset($4::jsonb) AS value(id text,employee_id text,payload jsonb,source_identity_sha256 char(64)))
     INSERT INTO ${table}(${columns.join(",")})
     SELECT ${values.join(",")} FROM src
     RETURNING id::text,legacy_source_identity_sha256`,
    [targetScope.tenantId, targetScope.parkId, actorId, JSON.stringify(prepared)],
  ), `insert ${table}`);
  if (result.length !== prepared.length || new Set(result.map(row => row.legacy_source_identity_sha256)).size !== prepared.length) fail("PRODUCTION_IMPORT_T5_NONFILE_TARGET_COLLISION", `${table} insertion differs`);
  const bySource = new Map(result.map(row => [row.legacy_source_identity_sha256, row.id]));
  return rowsInput.map(record => ({ record, targetId: bySource.get(record.sourceIdentitySha256) }));
}

async function insertMaps(tx, operationId, batchId, inserted, quarantined) {
  const mapped = inserted.map(({ record, targetId }) => ({ source_system: record.sourceSystem, source_table: record.sourceTable, source_pk_canonical: record.sourcePkCanonical, source_identity_sha256: record.sourceIdentitySha256, source_row_sha256: record.sourceRowSha256, target_table: record.targetTable, target_id: targetId, mapping_status: "loaded" }));
  const rejected = quarantined.map(record => ({ source_system: record.sourceSystem, source_table: record.sourceTable, source_pk_canonical: record.sourcePkCanonical, source_identity_sha256: record.sourceIdentitySha256, source_row_sha256: record.sourceRowSha256, target_table: record.targetTable, mapping_status: "quarantined" }));
  for (const [input, status] of [[mapped, "loaded"], [rejected, "quarantined"]]) {
    if (input.length === 0) continue;
    const result = rows(await tx.query(
      `/* hr-prod-t5:insert-maps */
       WITH src AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS value(source_system text,source_table text,source_pk_canonical text,source_identity_sha256 char(64),source_row_sha256 char(64),target_table text,target_id uuid,mapping_status text))
       , maps AS (
         INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
         SELECT $1::uuid,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,true FROM src
         RETURNING id,source_identity_sha256
       )
       INSERT INTO hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id)
       SELECT $3,'T5',source_identity_sha256,$1::uuid,id FROM maps
       RETURNING source_identity_sha256`,
      [batchId, JSON.stringify(input), operationId],
    ), `insert ${status} maps`);
    if (result.length !== input.length) fail("PRODUCTION_IMPORT_T5_NONFILE_RECORD_MAP_REQUIRED", `${status} map count differs`);
  }
}

/**
 * Executes only inside the caller's already-authorized SERIALIZABLE transaction.
 * It has no connection, environment, CLI, credential, or automatic activation path.
 */
export async function writeT5NonfilePrivateStage(input) {
  validateInput(input);
  const records = validateRecords(input.privateStage.records);
  const employees = await resolveEmployees(input.tx, input.operationId, records);
  const batchId = await createBatch(input.tx, input.operationId, input.privateStage.sourceSnapshotHash);
  const inserted = [];
  for (const [table, config] of Object.entries(TABLES)) inserted.push(...await insertTable(input.tx, table, config, input.targetScope, input.actorId, records.filter(record => record.disposition === "insert" && record.targetTable === table), employees));
  const quarantined = records.filter(record => record.disposition === "quarantine");
  await insertMaps(input.tx, input.operationId, batchId, inserted, quarantined);
  const counts = { source: records.length, loaded: inserted.length, quarantined: quarantined.length };
  const result = rows(await input.tx.query(
    `/* hr-prod-t5:finish-batch */
     UPDATE migration_batch SET status='succeeded',phase='verify',counts=$2::jsonb,finished_at=now(),update_time=now()
     WHERE id=$1::uuid AND status='running' RETURNING id::text`,
    [batchId, JSON.stringify(counts)],
  ), "finish T5 migration batch");
  if (result.length !== 1 || result[0].id !== batchId) fail("PRODUCTION_IMPORT_T5_NONFILE_DATABASE_RESULT_INVALID", "T5 batch finish differs");
  const resultRecords = [
    ...inserted.map(({ record, targetId }) => ({
      sourceIdentitySha256: record.sourceIdentitySha256,
      disposition: "insert",
      targetTable: record.targetTable,
      targetId,
      businessIdentitySha256: businessIdentity(input.targetScope, record.targetTable, record.sourceIdentitySha256),
      targetAfterSha256: targetAfter(input.targetScope, record.targetTable, targetId, record.sourceRowSha256),
      targetVersionAfter: 1,
    })),
    ...quarantined.map(record => ({
      sourceIdentitySha256: record.sourceIdentitySha256,
      disposition: "quarantine",
      targetTable: record.targetTable,
      decisionAttestationSha256: hash(`yuzhou-hr-production-t5-quarantine-v1\0${record.sourceIdentitySha256}\0${record.quarantineReason}`),
    })),
  ];
  return { phase: "T5", migrationBatchId: batchId, counts, afterCanonicalSha256: computeT5NonfileAfterCanonicalSha256(input.targetScope, resultRecords), records: resultRecords };
}
