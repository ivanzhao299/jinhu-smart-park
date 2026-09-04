import { createHash } from "node:crypto";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const TABLES = Object.freeze({
  hr_employee_profile: Object.freeze({ kind: "employee", sourceTable: "dbo.person.core_residue", fields: ["id_type", "id_number_encrypted", "id_number_masked", "id_number_fingerprint", "gender", "date_of_birth", "ethnicity", "native_place", "political_status", "marital_status", "health_status", "address", "home_phone", "personal_mobile", "personal_email", "highest_education", "major", "degree", "graduation_school", "graduation_date", "foreign_language", "job_title", "job_grade", "legacy_professional_title_code", "technical_title", "legacy_source_identity_sha256", "legacy_source_row_sha256"], dates: new Set(["date_of_birth", "graduation_date"]) }),
  hr_employee_family: Object.freeze({ kind: "employee", sourceTable: "dbo.family", fields: ["relationship", "full_name_encrypted", "full_name_masked", "full_name_fingerprint", "contact_encrypted", "contact_masked", "contact_fingerprint", "birth_date", "work_unit", "job_title", "political_status", "legacy_source_identity_sha256", "legacy_source_row_sha256"], dates: new Set(["birth_date"]) }),
  hr_employee_skill: Object.freeze({ kind: "employee", sourceTable: "dbo.knowhow", fields: ["skill_name", "proficiency", "legacy_grade", "note", "legacy_source_identity_sha256", "legacy_source_row_sha256"], dates: new Set() }),
  hr_employee_credential: Object.freeze({ kind: "employee", sourceTable: "dbo.ticket", fields: ["credential_type", "credential_name", "number_encrypted", "number_masked", "number_fingerprint", "issuing_authority", "acquired_date", "valid_to", "note", "legacy_file_reference_sha256", "legacy_source_identity_sha256", "legacy_source_row_sha256"], dates: new Set(["acquired_date", "valid_to"]) }),
  hr_custom_field_definition: Object.freeze({ kind: "custom_definition", sourceTable: "dbo.defs", fields: ["field_code", "display_label", "value_type", "field_group", "sort_order", "sensitivity", "origin", "source_system", "source_table", "source_column", "source_identity_sha256", "source_row_sha256", "status", "legacy_definition_id", "legacy_datatype", "legacy_group_id", "legacy_sort_order", "legacy_nullable", "legacy_description_d_present", "legacy_description_d_sha256", "legacy_sqltext_present", "legacy_sqltext_sha256", "legacy_crosssql_present", "legacy_crosssql_sha256", "base_classification", "legacy_rule_classification"], dates: new Set() }),
  hr_custom_field_legacy_logic_fingerprint: Object.freeze({ kind: "custom_logic", sourceTable: "dbo.defs", fields: ["legacy_column", "classification", "execution", "source_present", "is_source_null", "source_value_sha256"], dates: new Set() }),
  hr_employee_custom_value: Object.freeze({ kind: "custom_value", sourceTable: "dbo.person", fields: ["text_value", "numeric_value", "date_value", "boolean_value", "is_source_null", "value_status", "origin", "source_system", "source_table", "source_column", "source_identity_sha256", "source_row_sha256"], dates: new Set(["date_value"]) }),
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

function validatePayloadBinding(record, config, index) {
  if (record.sourceTable !== config.sourceTable) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} source table differs`);
  if (config.kind === "employee") {
    if (record.payload.legacy_source_identity_sha256 !== record.sourceIdentitySha256 || record.payload.legacy_source_row_sha256 !== record.sourceRowSha256) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} source receipt differs`);
    return;
  }
  if (config.kind === "custom_logic") {
    const classifications = {
      description_d: "presentation_expression",
      sqltext: "legacy_sql_expression",
      flag: "legacy_behavior_flag",
      crosssql: "legacy_cross_lookup_sql",
      crosscolselectsql: "legacy_cross_column_sql",
      crossrowselectsql: "legacy_cross_row_sql",
      crosswhere: "legacy_cross_filter",
      querywhere: "legacy_query_filter",
      ascount: "legacy_aggregate_flag",
      ascount2: "legacy_secondary_aggregate_flag",
    };
    const fingerprintValid = record.payload.source_present
      ? record.payload.is_source_null === false && SHA256.test(record.payload.source_value_sha256 ?? "")
      : record.payload.is_source_null === true && record.payload.source_value_sha256 === null;
    if (classifications[record.payload.legacy_column] !== record.payload.classification || record.payload.execution !== "forbidden" || typeof record.payload.source_present !== "boolean" || typeof record.payload.is_source_null !== "boolean" || !fingerprintValid) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} custom definition logic payload invalid`);
    return;
  }
  if (record.payload.origin !== "legacy" || record.payload.source_system !== "yuzhou-v10" || record.payload.source_table !== config.sourceTable || record.payload.source_identity_sha256 !== record.sourceIdentitySha256 || record.payload.source_row_sha256 !== record.sourceRowSha256) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} custom source receipt differs`);
  if (config.kind === "custom_definition") {
    const fingerprints = ["description_d", "sqltext", "crosssql"].every(column => {
      const present = record.payload[`legacy_${column}_present`];
      const sha256 = record.payload[`legacy_${column}_sha256`];
      return typeof present === "boolean" && (present ? SHA256.test(sha256 ?? "") : sha256 === null);
    });
    if (!/^def(?:[1-9]|1[1-5]|2[1-5])$/u.test(record.payload.field_code ?? "") || record.payload.source_column !== record.payload.field_code || typeof record.payload.display_label !== "string" || record.payload.display_label.trim().length === 0 || !["text", "numeric", "date"].includes(record.payload.value_type) || !Number.isSafeInteger(record.payload.sort_order) || record.payload.sort_order < 0 || record.payload.sensitivity !== "restricted" || record.payload.status !== "enabled" || typeof record.payload.legacy_definition_id !== "string" || record.payload.legacy_definition_id.length === 0 || typeof record.payload.legacy_datatype !== "string" || record.payload.legacy_datatype.length === 0 || (record.payload.legacy_group_id !== null && typeof record.payload.legacy_group_id !== "string") || (record.payload.legacy_sort_order !== null && (!Number.isSafeInteger(record.payload.legacy_sort_order) || record.payload.legacy_sort_order < 0)) || (record.payload.legacy_nullable !== null && typeof record.payload.legacy_nullable !== "boolean") || !fingerprints || record.payload.base_classification !== record.payload.value_type || !["inert", "review_required"].includes(record.payload.legacy_rule_classification)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} custom definition payload invalid`);
    return;
  }
  if ((record.payload.text_value !== null && typeof record.payload.text_value !== "string") || (record.payload.numeric_value !== null && typeof record.payload.numeric_value !== "string") || (record.payload.date_value !== null && typeof record.payload.date_value !== "string") || (record.payload.boolean_value !== null && typeof record.payload.boolean_value !== "boolean")) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} custom value type invalid`);
  const values = [record.payload.text_value, record.payload.numeric_value, record.payload.date_value, record.payload.boolean_value].filter(value => value !== null);
  if (!/^def(?:[1-9]|1[1-5]|2[1-5])$/u.test(record.payload.source_column ?? "") || typeof record.payload.is_source_null !== "boolean" || !["valid", "null"].includes(record.payload.value_status) || (record.payload.value_status === "null" && (!record.payload.is_source_null || values.length !== 0)) || (record.payload.value_status === "valid" && (record.payload.is_source_null || values.length !== 1))) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} custom value payload invalid`);
}

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
  exactKeys(input, ["tx", "operationId", "targetIdentitySha256", "targetScope", "actorId", "privateStage"], [], "input");
  if (!input.tx || typeof input.tx.query !== "function" || !OPERATION_ID.test(input.operationId ?? "") || !SHA256.test(input.targetIdentitySha256 ?? "") || !UUID.test(input.actorId ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "transaction, operation, target, or actor invalid");
  exactKeys(input.targetScope, ["tenantId", "parkId", "scopeSha256"], [], "target scope");
  if (typeof input.targetScope.tenantId !== "string" || typeof input.targetScope.parkId !== "string" || !SHA256.test(input.targetScope.scopeSha256 ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "target scope invalid");
  exactKeys(input.privateStage, ["formatVersion", "artifactKind", "phase", "triple", "sourceSnapshotHash", "sourceRestoreReceiptSha256", "sourceBusinessSha256", "mappingContractSha256", "t0DecisionArtifactSha256", "t0TargetIdentitySha256", "t0TargetScopeSha256", "records", "productionImport"], [], "private stage");
  if (input.privateStage.formatVersion !== 1 || input.privateStage.artifactKind !== "yuzhou_hr_production_import_t5_nonfile_private_payload_stage" || input.privateStage.phase !== "T5" || input.privateStage.productionImport !== "HOLD" || !Array.isArray(input.privateStage.records) || !SHA256.test(input.privateStage.sourceSnapshotHash ?? "") || !SHA256.test(input.privateStage.sourceRestoreReceiptSha256 ?? "") || !SHA256.test(input.privateStage.sourceBusinessSha256 ?? "") || input.privateStage.mappingContractSha256 !== input.privateStage.triple?.mappingContractHash || !SHA256.test(input.privateStage.t0DecisionArtifactSha256 ?? "") || input.privateStage.t0TargetIdentitySha256 !== input.targetIdentitySha256 || input.privateStage.t0TargetScopeSha256 !== input.targetScope.scopeSha256) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "private stage invalid");
  exactKeys(input.privateStage.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], "private stage triple");
  if (!/^[0-9a-f]{40}$/u.test(input.privateStage.triple.codeSha ?? "") || !SHA256.test(input.privateStage.triple.sourceSnapshotHash ?? "") || !SHA256.test(input.privateStage.triple.mappingContractHash ?? "") || input.privateStage.triple.sourceSnapshotHash !== input.privateStage.sourceSnapshotHash) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "private stage triple invalid");
}

async function assertWriterContext(input, recordCount) {
  const result = rows(await input.tx.query(
    `/* hr-prod-t5:assert-writer-context */
     SELECT hr_yuzhou_assert_t5_nonfile_writer_context(
       $1,$2,$3,$4,$5,$6::uuid,$7,$8,$9,$10::bigint
     ) AS authorized`,
    [
      input.operationId,
      input.targetIdentitySha256,
      input.targetScope.tenantId,
      input.targetScope.parkId,
      input.targetScope.scopeSha256,
      input.actorId,
      input.privateStage.triple.codeSha,
      input.privateStage.sourceSnapshotHash,
      input.privateStage.mappingContractSha256,
      recordCount,
    ],
  ), "authorize T5 writer context");
  if (result.length !== 1 || result[0].authorized !== true) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_CONTEXT_INVALID", "database did not authorize the exact T5 target/scope/actor context");
}

function validateRecords(recordsInput) {
  const seen = new Set();
  const records = recordsInput.map((record, index) => {
    exactKeys(record, ["sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256", "targetTable", "dependencyMode", "dependencyRefs", "disposition"], ["payload", "quarantineReason"], `private stage record ${index}`);
    const config = TABLES[record.targetTable];
    if (record.sourceSystem !== "yuzhou-v10" || !config || !SHA256.test(record.sourceIdentitySha256 ?? "") || !SHA256.test(record.sourceRowSha256 ?? "") || record.sourcePkCanonical !== `sha256:${record.sourceIdentitySha256}` || !["insert", "quarantine"].includes(record.disposition) || seen.has(record.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} invalid`);
    seen.add(record.sourceIdentitySha256);
    if (!Array.isArray(record.dependencyRefs)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} dependencies invalid`);
    const dependencies = new Map();
    for (const dependency of record.dependencyRefs) {
      exactKeys(dependency, ["role", "phase", "expectedTargetTable", "sourceIdentitySha256"], [], `record ${index} dependency`);
      if (!SHA256.test(dependency.sourceIdentitySha256 ?? "") || dependencies.has(dependency.role)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} dependency invalid`);
      dependencies.set(dependency.role, dependency);
    }
    if (config.kind === "employee") {
      const dependency = dependencies.get("employee");
      if (record.dependencyMode !== "employee" || record.dependencyRefs.length > 1 || (dependency && (dependency.phase !== "T0" || dependency.expectedTargetTable !== "hr_employee"))) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} employee dependency invalid`);
    } else if (config.kind === "custom_definition") {
      if (record.dependencyMode !== "none" || record.dependencyRefs.length !== 0 || record.disposition !== "insert") fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} definition dependency invalid`);
    } else if (config.kind === "custom_logic") {
      const definition = dependencies.get("custom_field_definition");
      if (record.dependencyMode !== "custom_field_definition" || record.disposition !== "insert" || !definition || definition.phase !== "T5" || definition.expectedTargetTable !== "hr_custom_field_definition" || record.dependencyRefs.length !== 1) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} custom definition logic dependency invalid`);
    } else {
      const employee = dependencies.get("employee");
      const definition = dependencies.get("custom_field_definition");
      if (record.dependencyMode !== "employee_custom_field" || !definition || definition.phase !== "T5" || definition.expectedTargetTable !== "hr_custom_field_definition" || (employee && (employee.phase !== "T0" || employee.expectedTargetTable !== "hr_employee")) || record.dependencyRefs.length !== (employee ? 2 : 1)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `record ${index} custom value dependencies invalid`);
    }
    if (record.disposition === "insert") {
      if (!object(record.payload) || Object.hasOwn(record, "quarantineReason") || (["employee", "custom_value"].includes(config.kind) && !dependencies.has("employee"))) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `insert ${index} invalid`);
      const expected = config.fields;
      if (JSON.stringify(Object.keys(record.payload).sort()) !== JSON.stringify([...expected].sort())) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `insert ${index} payload fields differ`);
      validatePayloadBinding(record, config, index);
    } else if (Object.hasOwn(record, "payload") || typeof record.quarantineReason !== "string" || record.quarantineReason.length === 0 || record.dependencyRefs.length > (config.kind === "custom_value" ? 2 : 1)) {
      fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", `quarantine ${index} invalid`);
    }
    return structuredClone(record);
  });
  const definitions = new Map(records.filter(record => record.targetTable === "hr_custom_field_definition" && record.disposition === "insert").map(record => [record.sourceIdentitySha256, record]));
  const logicColumns = new Set(["description_d", "sqltext", "flag", "crosssql", "crosscolselectsql", "crossrowselectsql", "crosswhere", "querywhere", "ascount", "ascount2"]);
  const logicByDefinition = new Map([...definitions.keys()].map(sourceIdentitySha256 => [sourceIdentitySha256, new Map()]));
  for (const record of records.filter(record => ["hr_employee_custom_value", "hr_custom_field_legacy_logic_fingerprint"].includes(record.targetTable))) {
    const definition = record.dependencyRefs.find(dependency => dependency.role === "custom_field_definition");
    const definitionRecord = definitions.get(definition.sourceIdentitySha256);
    if (!definitionRecord || (record.targetTable === "hr_employee_custom_value" && record.payload && definitionRecord.payload.source_column !== record.payload.source_column)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "custom record definition missing");
    if (record.targetTable === "hr_custom_field_legacy_logic_fingerprint") {
      const expectedIdentity = hash(`yuzhou-hr-production-t5-custom-definition-logic-v1\0${definition.sourceIdentitySha256}\0${record.payload.legacy_column}`);
      const expectedRow = hash(canonicalJson({ definitionSourceRowSha256: definitionRecord.sourceRowSha256, ...record.payload }));
      if (record.sourceIdentitySha256 !== expectedIdentity || record.sourceRowSha256 !== expectedRow || logicByDefinition.get(definition.sourceIdentitySha256).has(record.payload.legacy_column)) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "custom definition logic receipt differs");
      logicByDefinition.get(definition.sourceIdentitySha256).set(record.payload.legacy_column, record);
      continue;
    }
    if (record.disposition === "insert" && record.payload.value_status === "valid") {
      const typedField = { text: "text_value", numeric: "numeric_value", date: "date_value", boolean: "boolean_value" }[definitionRecord.payload.value_type];
      if (record.payload[typedField] === null) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "custom value definition type differs");
    }
  }
  for (const [definitionIdentity, definitionRecord] of definitions) {
    const logic = logicByDefinition.get(definitionIdentity);
    if (logic.size !== logicColumns.size || [...logicColumns].some(column => !logic.has(column))) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "every custom definition requires all ten logic fingerprints");
    for (const column of ["description_d", "sqltext", "crosssql"]) {
      const payload = logic.get(column).payload;
      if (definitionRecord.payload[`legacy_${column}_present`] !== payload.source_present || definitionRecord.payload[`legacy_${column}_sha256`] !== payload.source_value_sha256) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "custom definition logic summary differs");
    }
    const expectedRuleClassification = [...logic.values()].some(record => record.payload.source_present) ? "review_required" : "inert";
    if (definitionRecord.payload.legacy_rule_classification !== expectedRuleClassification) fail("PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID", "custom definition rule classification differs");
  }
  return records;
}

async function resolveEmployees(tx, operationId, targetScope, records) {
  const sourceIdentities = [...new Set(records.filter(record => record.disposition === "insert").map(record => record.dependencyRefs.find(dependency => dependency.role === "employee")?.sourceIdentitySha256).filter(Boolean))];
  if (sourceIdentities.length === 0) return new Map();
  const result = rows(await tx.query(
    `/* hr-prod-t5:resolve-employees */
     SELECT map.source_identity_sha256,map.target_id::text AS employee_id
     FROM legacy_record_map map
     JOIN migration_batch batch ON batch.id=map.batch_id
     JOIN hr_employee employee ON employee.id=map.target_id
       AND employee.tenant_id::text=$3 AND employee.park_id::text=$4 AND employee.is_deleted=false
     WHERE batch.execution_context='production_import'
       AND batch.production_import_operation_id=$1
       AND batch.production_import_phase='T0'
       AND batch.status='succeeded'
       AND map.target_table='hr_employee'
       AND map.mapping_status IN ('loaded','verified')
       AND map.is_active=true
       AND map.source_identity_sha256=ANY($2::char(64)[])`,
    [operationId, sourceIdentities, targetScope.tenantId, targetScope.parkId],
  ), "resolve employees");
  const resolved = new Map(result.map(row => [row.source_identity_sha256, row.employee_id]));
  if (result.length !== sourceIdentities.length || resolved.size !== sourceIdentities.length || [...resolved.values()].some(value => !UUID.test(value ?? ""))) fail("PRODUCTION_IMPORT_T5_NONFILE_EMPLOYEE_MAP_REQUIRED", "every T5 insert must bind exactly one scoped T0 employee");
  return resolved;
}

async function createBatch(tx, operationId, sourceSnapshotHash, actorId) {
  const result = rows(await tx.query(
    `/* hr-prod-t5:create-batch */
     INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,counts,started_at,execution_context,production_import_operation_id,production_import_phase,production_import_actor_id)
     SELECT operation_id||'-t5','yuzhou-v10',source_snapshot_sha256,current_database(),'load','running','prod-import-v2@'||code_sha,'{}'::jsonb,now(),'production_import',operation_id,'T5',$3::uuid
     FROM hr_yuzhou_production_import_operation
     WHERE operation_id=$1 AND execution_contract_version=2 AND status='running'
       AND current_phase='T5' AND source_snapshot_sha256=$2
     RETURNING id::text`,
    [operationId, sourceSnapshotHash, actorId],
  ), "create T5 migration batch");
  if (result.length !== 1 || !UUID.test(result[0].id ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_DATABASE_RESULT_INVALID", "T5 batch unavailable");
  return result[0].id;
}

function selectExpression(field, dates) {
  return dates.has(field) ? `NULLIF(src.payload->>'${field}','')::date` : `src.payload->>'${field}'`;
}

async function insertTable(tx, table, config, targetScope, actorId, rowsInput, employees) {
  if (rowsInput.length === 0) return [];
  const prepared = rowsInput.map(record => ({ id: deriveTargetId(targetScope, table, record.sourceIdentitySha256), employee_id: employees.get(record.dependencyRefs.find(dependency => dependency.role === "employee").sourceIdentitySha256), payload: record.payload, source_identity_sha256: record.sourceIdentitySha256 }));
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

async function insertCustomDefinitions(tx, batchId, targetScope, actorId, rowsInput) {
  if (rowsInput.length === 0) return [];
  const prepared = rowsInput.map(record => ({ id: deriveTargetId(targetScope, record.targetTable, record.sourceIdentitySha256), payload: record.payload, source_identity_sha256: record.sourceIdentitySha256 }));
  const result = rows(await tx.query(
    `/* hr-prod-t5:insert:hr_custom_field_definition */
     WITH src AS (SELECT * FROM jsonb_to_recordset($5::jsonb) AS value(id text,payload jsonb,source_identity_sha256 char(64)))
     INSERT INTO hr_custom_field_definition(id,tenant_id,park_id,migration_batch_id,field_code,display_label,value_type,field_group,sort_order,sensitivity,origin,source_system,source_table,source_column,source_identity_sha256,source_row_sha256,status,legacy_definition_id,legacy_datatype,legacy_group_id,legacy_sort_order,legacy_nullable,legacy_description_d_present,legacy_description_d_sha256,legacy_sqltext_present,legacy_sqltext_sha256,legacy_crosssql_present,legacy_crosssql_sha256,base_classification,legacy_rule_classification,create_by,update_by)
     SELECT src.id::uuid,$1,$2,$3::uuid,src.payload->>'field_code',src.payload->>'display_label',src.payload->>'value_type',src.payload->>'field_group',NULLIF(src.payload->>'sort_order','')::integer,src.payload->>'sensitivity',src.payload->>'origin',src.payload->>'source_system',src.payload->>'source_table',src.payload->>'source_column',src.payload->>'source_identity_sha256',src.payload->>'source_row_sha256',src.payload->>'status',src.payload->>'legacy_definition_id',src.payload->>'legacy_datatype',src.payload->>'legacy_group_id',NULLIF(src.payload->>'legacy_sort_order','')::integer,NULLIF(src.payload->>'legacy_nullable','')::boolean,(src.payload->>'legacy_description_d_present')::boolean,src.payload->>'legacy_description_d_sha256',(src.payload->>'legacy_sqltext_present')::boolean,src.payload->>'legacy_sqltext_sha256',(src.payload->>'legacy_crosssql_present')::boolean,src.payload->>'legacy_crosssql_sha256',src.payload->>'base_classification',src.payload->>'legacy_rule_classification',$4::uuid,$4::uuid
     FROM src
     RETURNING id::text,source_identity_sha256`,
    [targetScope.tenantId, targetScope.parkId, batchId, actorId, JSON.stringify(prepared)],
  ), "insert hr_custom_field_definition");
  if (result.length !== prepared.length || new Set(result.map(row => row.source_identity_sha256)).size !== prepared.length) fail("PRODUCTION_IMPORT_T5_NONFILE_TARGET_COLLISION", "hr_custom_field_definition insertion differs");
  const bySource = new Map(result.map(row => [row.source_identity_sha256, row.id]));
  return rowsInput.map(record => ({ record, targetId: bySource.get(record.sourceIdentitySha256) }));
}

async function insertCustomDefinitionLogic(tx, targetScope, rowsInput, definitions) {
  if (rowsInput.length === 0) return [];
  const prepared = rowsInput.map(record => {
    const definition = record.dependencyRefs.find(dependency => dependency.role === "custom_field_definition");
    return {
      id: deriveTargetId(targetScope, record.targetTable, record.sourceIdentitySha256),
      definition_id: definitions.get(definition.sourceIdentitySha256),
      payload: record.payload,
      source_identity_sha256: record.sourceIdentitySha256,
    };
  });
  if (prepared.some(row => !UUID.test(row.id) || !UUID.test(row.definition_id ?? ""))) fail("PRODUCTION_IMPORT_T5_NONFILE_TARGET_COLLISION", "custom definition logic binding missing");
  const result = rows(await tx.query(
    `/* hr-prod-t5:insert:hr_custom_field_legacy_logic_fingerprint */
     WITH src AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS value(id text,definition_id text,payload jsonb,source_identity_sha256 char(64)))
     INSERT INTO hr_custom_field_legacy_logic_fingerprint(id,tenant_id,park_id,definition_id,legacy_column,classification,execution,source_present,is_source_null,source_value_sha256)
     SELECT src.id::uuid,$1,$2,src.definition_id::uuid,src.payload->>'legacy_column',src.payload->>'classification',src.payload->>'execution',(src.payload->>'source_present')::boolean,(src.payload->>'is_source_null')::boolean,src.payload->>'source_value_sha256'
     FROM src
     RETURNING id::text`,
    [targetScope.tenantId, targetScope.parkId, JSON.stringify(prepared)],
  ), "insert hr_custom_field_legacy_logic_fingerprint");
  const returned = new Set(result.map(row => row.id));
  if (result.length !== prepared.length || returned.size !== prepared.length || prepared.some(row => !returned.has(row.id))) fail("PRODUCTION_IMPORT_T5_NONFILE_TARGET_COLLISION", "hr_custom_field_legacy_logic_fingerprint insertion differs");
  const bySource = new Map(prepared.map(row => [row.source_identity_sha256, row.id]));
  return rowsInput.map(record => ({ record, targetId: bySource.get(record.sourceIdentitySha256) }));
}

async function insertCustomValues(tx, batchId, targetScope, actorId, rowsInput, employees, definitions) {
  if (rowsInput.length === 0) return [];
  const prepared = rowsInput.map(record => {
    const employeeDependency = record.dependencyRefs.find(dependency => dependency.role === "employee");
    const definitionDependency = record.dependencyRefs.find(dependency => dependency.role === "custom_field_definition");
    return {
      id: deriveTargetId(targetScope, record.targetTable, record.sourceIdentitySha256),
      employee_id: employees.get(employeeDependency.sourceIdentitySha256),
      definition_id: definitions.get(definitionDependency.sourceIdentitySha256),
      payload: record.payload,
      source_identity_sha256: record.sourceIdentitySha256,
    };
  });
  if (prepared.some(row => !UUID.test(row.id) || !UUID.test(row.employee_id ?? "") || !UUID.test(row.definition_id ?? ""))) fail("PRODUCTION_IMPORT_T5_NONFILE_EMPLOYEE_MAP_REQUIRED", "custom value dependency binding missing");
  const result = rows(await tx.query(
    `/* hr-prod-t5:insert:hr_employee_custom_value */
     WITH src AS (SELECT * FROM jsonb_to_recordset($5::jsonb) AS value(id text,employee_id text,definition_id text,payload jsonb,source_identity_sha256 char(64)))
     INSERT INTO hr_employee_custom_value(id,tenant_id,park_id,migration_batch_id,employee_id,definition_id,text_value,numeric_value,date_value,boolean_value,is_source_null,value_status,origin,source_system,source_table,source_column,source_identity_sha256,source_row_sha256,create_by,update_by)
     SELECT src.id::uuid,$1,$2,$3::uuid,src.employee_id::uuid,src.definition_id::uuid,src.payload->>'text_value',NULLIF(src.payload->>'numeric_value','')::numeric(28,8),NULLIF(src.payload->>'date_value','')::date,NULLIF(src.payload->>'boolean_value','')::boolean,(src.payload->>'is_source_null')::boolean,src.payload->>'value_status',src.payload->>'origin',src.payload->>'source_system',src.payload->>'source_table',src.payload->>'source_column',src.payload->>'source_identity_sha256',src.payload->>'source_row_sha256',$4::uuid,$4::uuid
     FROM src
     RETURNING id::text,source_identity_sha256`,
    [targetScope.tenantId, targetScope.parkId, batchId, actorId, JSON.stringify(prepared)],
  ), "insert hr_employee_custom_value");
  if (result.length !== prepared.length || new Set(result.map(row => row.source_identity_sha256)).size !== prepared.length) fail("PRODUCTION_IMPORT_T5_NONFILE_TARGET_COLLISION", "hr_employee_custom_value insertion differs");
  const bySource = new Map(result.map(row => [row.source_identity_sha256, row.id]));
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

async function readBackProjection(tx, operationId, batchId, targetScope, expectedRecords) {
  const result = rows(await tx.query(
    `/* hr-prod-t5:readback-projection */
     WITH target_rows AS (
       SELECT 'hr_employee_profile'::text AS target_table,id,tenant_id::text,park_id::text,legacy_source_identity_sha256 AS source_identity_sha256,legacy_source_row_sha256 AS source_row_sha256,NULL::jsonb AS safe_payload FROM hr_employee_profile
       UNION ALL SELECT 'hr_employee_family',id,tenant_id::text,park_id::text,legacy_source_identity_sha256,legacy_source_row_sha256,NULL::jsonb FROM hr_employee_family
       UNION ALL SELECT 'hr_employee_skill',id,tenant_id::text,park_id::text,legacy_source_identity_sha256,legacy_source_row_sha256,NULL::jsonb FROM hr_employee_skill
       UNION ALL SELECT 'hr_employee_credential',id,tenant_id::text,park_id::text,legacy_source_identity_sha256,legacy_source_row_sha256,NULL::jsonb FROM hr_employee_credential
       UNION ALL SELECT 'hr_custom_field_definition',id,tenant_id::text,park_id::text,source_identity_sha256,source_row_sha256,NULL::jsonb FROM hr_custom_field_definition
       UNION ALL SELECT 'hr_custom_field_legacy_logic_fingerprint',id,tenant_id::text,park_id::text,NULL::char(64),NULL::char(64),jsonb_build_object('legacy_column',legacy_column,'classification',classification,'execution',execution,'source_present',source_present,'is_source_null',is_source_null,'source_value_sha256',source_value_sha256) FROM hr_custom_field_legacy_logic_fingerprint
       UNION ALL SELECT 'hr_employee_custom_value',id,tenant_id::text,park_id::text,source_identity_sha256,source_row_sha256,NULL::jsonb FROM hr_employee_custom_value
     )
     SELECT map.source_identity_sha256,map.source_row_sha256,map.target_table,
            map.target_id::text,map.mapping_status,
            target.tenant_id AS target_tenant_id,target.park_id AS target_park_id,
            target.source_identity_sha256 AS target_source_identity_sha256,
            target.source_row_sha256 AS target_source_row_sha256,
            target.safe_payload AS target_safe_payload
     FROM legacy_record_map map
     JOIN hr_yuzhou_production_import_projection_receipt receipt
       ON receipt.legacy_record_map_id=map.id AND receipt.migration_batch_id=map.batch_id
      AND receipt.operation_id=$1 AND receipt.phase='T5'
      AND receipt.source_identity_sha256=map.source_identity_sha256
     LEFT JOIN target_rows target ON target.target_table=map.target_table AND target.id=map.target_id
     WHERE map.batch_id=$2::uuid AND map.is_active=true
       AND map.target_table=ANY($3::text[])
     ORDER BY map.source_identity_sha256`,
    [operationId, batchId, Object.keys(TABLES)],
  ), "read back T5 projection");
  if (result.length !== expectedRecords.length) fail("PRODUCTION_IMPORT_T5_NONFILE_READBACK_MISMATCH", "projection receipt count differs from the private stage");
  const expected = new Map(expectedRecords.map(record => [record.sourceIdentitySha256, record]));
  const resultRecords = [];
  for (const row of result) {
    const record = expected.get(row.source_identity_sha256);
    if (!record || row.source_row_sha256 !== record.sourceRowSha256 || row.target_table !== record.targetTable) fail("PRODUCTION_IMPORT_T5_NONFILE_READBACK_MISMATCH", "projection source/table receipt differs");
    expected.delete(record.sourceIdentitySha256);
    if (record.disposition === "insert") {
      const isLogicFingerprint = record.targetTable === "hr_custom_field_legacy_logic_fingerprint";
      const sourceReceiptMatches = isLogicFingerprint
        ? row.target_source_identity_sha256 === null && row.target_source_row_sha256 === null && canonicalJson(row.target_safe_payload) === canonicalJson(record.payload)
        : row.target_source_identity_sha256 === record.sourceIdentitySha256 && row.target_source_row_sha256 === record.sourceRowSha256;
      if (!["loaded", "verified"].includes(row.mapping_status) || !UUID.test(row.target_id ?? "") || row.target_tenant_id !== targetScope.tenantId || row.target_park_id !== targetScope.parkId || !sourceReceiptMatches) fail("PRODUCTION_IMPORT_T5_NONFILE_READBACK_MISMATCH", "inserted target is absent or outside its exact scope/source receipt");
      resultRecords.push({
        sourceIdentitySha256: row.source_identity_sha256,
        disposition: "insert",
        targetTable: row.target_table,
        targetId: row.target_id,
        businessIdentitySha256: businessIdentity(targetScope, row.target_table, row.source_identity_sha256),
        targetAfterSha256: targetAfter(targetScope, row.target_table, row.target_id, isLogicFingerprint ? hash(canonicalJson(row.target_safe_payload)) : row.target_source_row_sha256),
        targetVersionAfter: 1,
      });
    } else {
      if (row.mapping_status !== "quarantined" || row.target_id !== null || row.target_tenant_id !== null || row.target_park_id !== null || row.target_source_identity_sha256 !== null || row.target_source_row_sha256 !== null) fail("PRODUCTION_IMPORT_T5_NONFILE_READBACK_MISMATCH", "quarantine unexpectedly resolved a target row");
      resultRecords.push({
        sourceIdentitySha256: row.source_identity_sha256,
        disposition: "quarantine",
        targetTable: row.target_table,
        decisionAttestationSha256: hash(`yuzhou-hr-production-t5-quarantine-v1\0${row.source_identity_sha256}\0${record.quarantineReason}`),
      });
    }
  }
  if (expected.size !== 0) fail("PRODUCTION_IMPORT_T5_NONFILE_READBACK_MISMATCH", "private-stage records are absent from the database readback");
  const counts = {
    source: resultRecords.length,
    loaded: resultRecords.filter(record => record.disposition === "insert").length,
    quarantined: resultRecords.filter(record => record.disposition === "quarantine").length,
  };
  const readbackSha256 = hash(`yuzhou-hr-production-t5-safe-readback-v1\0${targetScope.scopeSha256}\0${canonicalJson(result.map(row => ({
    sourceIdentitySha256: row.source_identity_sha256,
    sourceRowSha256: row.source_row_sha256,
    targetTable: row.target_table,
    targetId: row.target_id,
    mappingStatus: row.mapping_status,
    targetSafePayload: row.target_safe_payload,
  })))}`);
  return { counts, readbackSha256, resultRecords };
}

/**
 * Executes only inside the caller's already-authorized SERIALIZABLE transaction.
 * It has no connection, environment, CLI, credential, or automatic activation path.
 */
export async function writeT5NonfilePrivateStage(input) {
  validateInput(input);
  const records = validateRecords(input.privateStage.records);
  await assertWriterContext(input, records.length);
  const employees = await resolveEmployees(input.tx, input.operationId, input.targetScope, records);
  const batchId = await createBatch(input.tx, input.operationId, input.privateStage.sourceSnapshotHash, input.actorId);
  const inserted = [];
  for (const [table, config] of Object.entries(TABLES).filter(([, value]) => value.kind === "employee")) inserted.push(...await insertTable(input.tx, table, config, input.targetScope, input.actorId, records.filter(record => record.disposition === "insert" && record.targetTable === table), employees));
  const insertedDefinitions = await insertCustomDefinitions(input.tx, batchId, input.targetScope, input.actorId, records.filter(record => record.disposition === "insert" && record.targetTable === "hr_custom_field_definition"));
  inserted.push(...insertedDefinitions);
  const definitions = new Map(insertedDefinitions.map(({ record, targetId }) => [record.sourceIdentitySha256, targetId]));
  inserted.push(...await insertCustomDefinitionLogic(input.tx, input.targetScope, records.filter(record => record.disposition === "insert" && record.targetTable === "hr_custom_field_legacy_logic_fingerprint"), definitions));
  inserted.push(...await insertCustomValues(input.tx, batchId, input.targetScope, input.actorId, records.filter(record => record.disposition === "insert" && record.targetTable === "hr_employee_custom_value"), employees, definitions));
  const quarantined = records.filter(record => record.disposition === "quarantine");
  await insertMaps(input.tx, input.operationId, batchId, inserted, quarantined);
  const { counts, readbackSha256, resultRecords } = await readBackProjection(input.tx, input.operationId, batchId, input.targetScope, records);
  const result = rows(await input.tx.query(
    `/* hr-prod-t5:finish-batch */
     UPDATE migration_batch SET status='succeeded',phase='verify',counts=$2::jsonb,finished_at=now(),update_time=now()
     WHERE id=$1::uuid AND status='running' RETURNING id::text`,
    [batchId, JSON.stringify(counts)],
  ), "finish T5 migration batch");
  if (result.length !== 1 || result[0].id !== batchId) fail("PRODUCTION_IMPORT_T5_NONFILE_DATABASE_RESULT_INVALID", "T5 batch finish differs");
  return { phase: "T5", migrationBatchId: batchId, counts, readbackSha256, afterCanonicalSha256: computeT5NonfileAfterCanonicalSha256(input.targetScope, resultRecords), records: resultRecords };
}
