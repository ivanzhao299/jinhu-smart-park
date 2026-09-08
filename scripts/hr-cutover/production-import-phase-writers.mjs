import { createHash } from "node:crypto";
import { normalizeProductionT1LocalTimestamp } from "./production-t1-local-timestamp.mjs";
import { computeProductionImportTouchedPhaseState, computeProductionImportTouchedPhaseBefore } from "./production-import-phase-state.mjs";

import { ProductionImportExecutionError, computeProductionImportPayloadHash } from "./production-import-sealed-plan-lib.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash,
  deriveProductionImportTargetId,
} from "./production-import-target-model.mjs";

const PHASES = Object.freeze(["T0", "T1", "T2", "T3"]);
const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DEFAULT_BATCH_SIZE = 1000;
const MIN_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 2000;
const MODEL = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL;
const TABLE_STORAGE = Object.freeze({
  // This append-only evidence table intentionally has no soft-delete, version,
  // or update timestamp columns. Its production-import version is the fixed
  // logical value 1 and the target model forbids merge.
  hr_contract_legacy_evidence: Object.freeze({ versioned: false, softDelete: false, updateTimestamp: false, fieldTypes: Object.freeze({ protected_file_id: "uuid", size_bytes: "bigint" }) }),
  hr_employment_event: Object.freeze({ localTimestampFields: Object.freeze(["source_effective_at"]) }),
  hr_contract_change: Object.freeze({ localTimestampFields: Object.freeze(["signed_at"]) }),
});

const fail = (code, detail) => { throw new ProductionImportExecutionError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

function exactKeys(value, required, optional, label) {
  if (!isObject(value)) fail("PRODUCTION_IMPORT_PHASE_WRITER_INPUT_INVALID", `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.has(key))) {
    fail("PRODUCTION_IMPORT_PHASE_WRITER_INPUT_INVALID", `${label} keys differ`);
  }
}

function rowsOf(result, label) {
  if (!result || !Array.isArray(result.rows)) fail("PRODUCTION_IMPORT_PHASE_WRITER_DATABASE_RESULT_INVALID", `${label} returned no rows`);
  return result.rows;
}

function oneRow(result, label) {
  const rows = rowsOf(result, label);
  if (rows.length !== 1) fail("PRODUCTION_IMPORT_PHASE_WRITER_DATABASE_RESULT_INVALID", `${label} expected one row`);
  return rows[0];
}

function assertBuffer(value, length, label) {
  if (!Buffer.isBuffer(value) || (length && value.length !== length) || (!length && value.length === 0)) {
    fail("PRODUCTION_IMPORT_PHASE_WRITER_CRYPTO_INVALID", `${label} invalid`);
  }
  return value;
}

function sqlType(table, rule, field) {
  const override = tableStorage(table).fieldTypes?.[field];
  if (override) return override;
  if (tableStorage(table).localTimestampFields?.includes(field)) return "timestamp";
  if (rule.integerFields.includes(field)) return "integer";
  if (rule.booleanFields.includes(field)) return "boolean";
  if (rule.decimalStringFields.includes(field)) return "numeric";
  if (rule.dateFields.includes(field)) return "date";
  if (rule.timestampFields.includes(field)) return "timestamptz";
  if (rule.jsonObjectFields.includes(field)) return "jsonb";
  if (rule.derivedFields.includes(field)) return "uuid";
  return "text";
}

function scopeType() {
  // All current tenant/park scope columns, including sys_org, are varchar.
  return "text";
}

function tableStorage(table) {
  return TABLE_STORAGE[table] ?? { versioned: true, softDelete: true, updateTimestamp: true };
}

function recordsetColumns(table, rule, { withExpectedVersion = false } = {}) {
  return [
    "id uuid",
    `tenant_id ${scopeType(table)}`,
    `park_id ${scopeType(table)}`,
    ...(withExpectedVersion ? ["expected_version integer"] : []),
    ...[...rule.fieldWhitelist, ...rule.derivedFields].map(field => `${field} ${sqlType(table, rule, field)}`),
  ].join(",");
}

function normalizeDatabaseValue(table, rule, field, value) {
  if (value === null || value === undefined) return value ?? null;
  if (table === "hr_employment_event" && field === "source_effective_at") {
    // SELECT projects exact PostgreSQL microseconds as text. A JS Date has
    // already lost that precision and cannot prove a target canonical hash.
    if (typeof value !== "string" || normalizeProductionT1LocalTimestamp(value) !== value) fail("PRODUCTION_IMPORT_T1_TIMESTAMP_READBACK_INVALID", "exact local timestamp text required");
    return value;
  }
  if (tableStorage(table).fieldTypes?.[field] === "bigint") return String(value);
  if (rule.integerFields.includes(field)) return Number(value);
  if (rule.booleanFields.includes(field)) return Boolean(value);
  if (rule.decimalStringFields.includes(field)) return String(value);
  if (rule.dateFields.includes(field) && value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (tableStorage(table).localTimestampFields?.includes(field) && value instanceof Date) {
    const date = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    const time = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(value.getSeconds()).padStart(2, "0")}.${String(value.getMilliseconds()).padStart(3, "0")}`;
    return `${date}T${time}`;
  }
  if (rule.timestampFields.includes(field) && value instanceof Date) return value.toISOString();
  return value;
}

function validatePayload(record, bundleRecord, rule) {
  if (!isObject(bundleRecord.payload)) fail("PRODUCTION_IMPORT_PHASE_WRITER_PAYLOAD_INVALID", `${record.plannedTargetTable} payload missing`);
  const keys = Object.keys(bundleRecord.payload);
  if (keys.some(key => !rule.fieldWhitelist.includes(key))) fail("PRODUCTION_IMPORT_TARGET_FIELD_DENIED", `${record.plannedTargetTable} contains an unknown column`);
  if (record.disposition !== "quarantine") {
    if (keys.length !== rule.fieldWhitelist.length || rule.fieldWhitelist.some(field => !Object.hasOwn(bundleRecord.payload, field))) {
      fail("PRODUCTION_IMPORT_PHASE_WRITER_PAYLOAD_INVALID", `${record.plannedTargetTable} payload is incomplete`);
    }
  }
  if (computeProductionImportPayloadHash(bundleRecord.payload) !== record.payloadSha256 || bundleRecord.payloadSha256 !== record.payloadSha256) {
    fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH", `${record.phase}.${record.sourceIdentitySha256}`);
  }
}

function validateRecord(record, bundleRecord, phaseName) {
  const rule = MODEL.targetTables[record?.plannedTargetTable];
  if (!rule || rule.phase !== phaseName || bundleRecord?.targetTable !== record.plannedTargetTable) {
    fail("PRODUCTION_IMPORT_TARGET_TABLE_DENIED", `${phaseName}.${record?.plannedTargetTable ?? "unknown"}`);
  }
  if (!SHA256.test(record.sourceIdentitySha256 ?? "") || !SHA256.test(record.sourceRowSha256 ?? "") || record.sourcePkCanonical !== `sha256:${record.sourceIdentitySha256}` || record.sourceSystem !== MODEL.sourceSystem || !rule.allowedSourceTables.includes(record.sourceTable)) {
    fail("PRODUCTION_IMPORT_SOURCE_PROVENANCE_INVALID", `${phaseName}.${record.sourceIdentitySha256 ?? "unknown"}`);
  }
  if (!rule.allowedDispositions.includes(record.disposition)) fail("PRODUCTION_IMPORT_DISPOSITION_INVALID", `${record.plannedTargetTable}.${record.disposition}`);
  if (record.disposition !== "quarantine" && (!UUID.test(record.targetId ?? "") || record.targetTable !== record.plannedTargetTable || !SHA256.test(record.expectedTargetAfterSha256 ?? "") || !Number.isSafeInteger(record.targetVersionAfter) || record.targetVersionAfter < 0)) {
    fail("PRODUCTION_IMPORT_PHASE_WRITER_TARGET_INVALID", `${record.plannedTargetTable}.${record.sourceIdentitySha256}`);
  }
  if (record.disposition === "insert" && (record.expectedTargetBeforeSha256 !== undefined || record.expectedTargetVersionBefore !== undefined || record.targetVersionAfter !== 1)) fail("PRODUCTION_IMPORT_PHASE_WRITER_TARGET_INVALID", `${record.plannedTargetTable} insert CAS shape`);
  if (["merge", "skip_approved"].includes(record.disposition) && (!SHA256.test(record.expectedTargetBeforeSha256 ?? "") || !Number.isSafeInteger(record.expectedTargetVersionBefore) || record.expectedTargetVersionBefore < 0)) fail("PRODUCTION_IMPORT_PHASE_WRITER_TARGET_INVALID", `${record.plannedTargetTable} existing CAS shape`);
  if (record.disposition === "merge" && record.targetVersionAfter !== record.expectedTargetVersionBefore + 1) fail("PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED", `${record.plannedTargetTable} merge version`);
  if (record.disposition === "skip_approved" && (record.targetVersionAfter !== record.expectedTargetVersionBefore || record.expectedTargetAfterSha256 !== record.expectedTargetBeforeSha256)) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${record.plannedTargetTable} skip differs`);
  if (!Array.isArray(record.dependencyRefs)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${record.plannedTargetTable} dependencies missing`);
  validatePayload(record, bundleRecord, rule);
  return rule;
}

function bindRows(phase, payloadBundle, phaseName) {
  if (phase?.phase !== phaseName || payloadBundle?.phase !== phaseName || !Array.isArray(phase.records) || !Array.isArray(payloadBundle.records) || phase.records.length !== payloadBundle.records.length) {
    fail("PRODUCTION_IMPORT_PHASE_WRITER_INPUT_INVALID", `${phaseName} phase/bundle differs`);
  }
  const bundles = new Map();
  for (const row of payloadBundle.records) {
    if (bundles.has(row.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_SOURCE_DUPLICATE", `${phaseName}.${row.sourceIdentitySha256}`);
    bundles.set(row.sourceIdentitySha256, row);
  }
  const sourceSeen = new Set();
  const targetSeen = new Set();
  return phase.records.map(record => {
    if (sourceSeen.has(record.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_SOURCE_DUPLICATE", `${phaseName}.${record.sourceIdentitySha256}`);
    sourceSeen.add(record.sourceIdentitySha256);
    const bundleRecord = bundles.get(record.sourceIdentitySha256);
    if (!bundleRecord || bundleRecord.sourceRowSha256 !== record.sourceRowSha256) fail("PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH", `${phaseName}.${record.sourceIdentitySha256}`);
    const rule = validateRecord(record, bundleRecord, phaseName);
    if (record.targetId) {
      const key = `${record.plannedTargetTable}:${record.targetId}`;
      if (targetSeen.has(key)) fail("PRODUCTION_IMPORT_TARGET_MAP_DUPLICATE", key);
      targetSeen.add(key);
    }
    bundles.delete(record.sourceIdentitySha256);
    return { record, payload: structuredClone(bundleRecord.payload), rule, derivedFields: {} };
  });
}

function topologicalLayers(rows, phaseName) {
  const local = new Map(rows.map(row => [row.record.sourceIdentitySha256, row]));
  for (const row of rows) for (const ref of row.record.dependencyRefs) {
    if (ref.phase === phaseName && !local.has(ref.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", `${row.record.plannedTargetTable}.${ref.role}`);
  }
  const emitted = new Set();
  const layers = [];
  while (emitted.size < rows.length) {
    const ready = rows.filter(row => !emitted.has(row.record.sourceIdentitySha256) && row.record.dependencyRefs.every(ref => ref.phase !== phaseName || emitted.has(ref.sourceIdentitySha256)));
    if (ready.length === 0) fail("PRODUCTION_IMPORT_DEPENDENCY_CYCLE", `${phaseName} contains a cycle or missing local dependency`);
    for (const row of ready) emitted.add(row.record.sourceIdentitySha256);
    layers.push(ready);
  }
  return layers;
}

async function createMigrationBatch(tx, operationId, phaseName) {
  const current = oneRow(await tx.query(
    `/* hr-prod-phase:set-current */
     UPDATE hr_yuzhou_production_import_operation
     SET current_phase=$2
     WHERE operation_id=$1 AND status='running'
     RETURNING operation_id`,
    [operationId, phaseName],
  ), "set current phase");
  if (current.operation_id !== operationId) fail("PRODUCTION_IMPORT_OPERATION_NOT_RUNNING", operationId);
  const row = oneRow(await tx.query(
    `/* hr-prod-phase:create-batch */
     INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,counts,started_at,execution_context,production_import_operation_id,production_import_phase)
     SELECT operation_id||'-'||lower($2),$3,source_snapshot_sha256,current_database(),'load','running','prod-import-v2@'||code_sha,'{}'::jsonb,now(),'production_import',operation_id,$2
     FROM hr_yuzhou_production_import_operation
     WHERE operation_id=$1 AND execution_contract_version=2 AND status='running' AND current_phase=$2
     RETURNING id::text AS id`,
    [operationId, phaseName, MODEL.sourceSystem],
  ), "create migration batch");
  if (!UUID.test(row.id ?? "")) fail("PRODUCTION_IMPORT_PHASE_WRITER_DATABASE_RESULT_INVALID", "migration batch id invalid");
  return row.id;
}

async function resolveDependencies(tx, operationId, phaseName, layer, lookup) {
  // Validate required references even when the whole layer has no references.
  // Quarantined records have no business target and may lack their source parent.
  for (const row of layer) for (const spec of row.rule.foreignKeys) {
    const declared = row.record.dependencyRefs.some(reference => reference.role === spec.dependencyRole);
    if (row.record.disposition !== "quarantine" && spec.required && !declared) fail("PRODUCTION_IMPORT_DEPENDENCY_REQUIRED", `${row.record.plannedTargetTable}.${spec.dependencyRole}`);
  }
  const references = [];
  for (const row of layer) for (const reference of row.record.dependencyRefs) {
    const spec = row.rule.foreignKeys.find(candidate => candidate.dependencyRole === reference.role);
    const referencedRule = MODEL.targetTables[reference.expectedTargetTable];
    if (!spec || spec.targetTable !== reference.expectedTargetTable || !referencedRule || referencedRule.phase !== reference.phase || PHASES.indexOf(reference.phase) > PHASES.indexOf(phaseName)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${row.record.plannedTargetTable}.${reference.role}`);
    references.push({ ...reference, child: row });
  }
  const identities = [...new Set(references.map(reference => reference.sourceIdentitySha256))];
  if (identities.length === 0) return;
  const result = lookup ? await lookup(identities, references) : rowsOf(await tx.query(
    `/* hr-prod-phase:resolve-dependencies */
     SELECT map.source_identity_sha256,map.target_table,map.target_id::text,map.mapping_status,
            batch.production_import_phase AS phase
     FROM migration_batch batch
     JOIN legacy_record_map map ON map.batch_id=batch.id
     WHERE batch.execution_context='production_import'
       AND batch.production_import_operation_id=$1
       AND map.source_identity_sha256=ANY($2::char(64)[])
       AND map.is_active`,
    [operationId, identities],
  ), "resolve dependencies");
  const resolved = new Map(result.map(row => [row.source_identity_sha256, row]));
  for (const reference of references) {
    const map = resolved.get(reference.sourceIdentitySha256);
    if (!map || map.phase !== reference.phase || map.target_table !== reference.expectedTargetTable) fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", `${reference.child.record.plannedTargetTable}.${reference.role}`);
    if (reference.child.record.disposition !== "quarantine" && (map.mapping_status === "quarantined" || !UUID.test(map.target_id ?? ""))) fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", `${reference.child.record.plannedTargetTable}.${reference.role}`);
    const spec = reference.child.rule.foreignKeys.find(candidate => candidate.dependencyRole === reference.role);
    reference.child.derivedFields[spec.column] = map.target_id ?? null;
  }
}

function verifyGeneratedSemantics(layer, targetScope, businessIdentities) {
  for (const row of layer) {
    if (row.record.disposition === "quarantine") continue;
    const businessIdentitySha256 = computeProductionImportBusinessIdentityHash(
      row.record.plannedTargetTable,
      targetScope,
      row.payload,
      row.derivedFields,
      MODEL,
    );
    if (row.record.businessIdentitySha256 !== businessIdentitySha256) {
      fail("PRODUCTION_IMPORT_BUSINESS_IDENTITY_MISMATCH", `${row.record.plannedTargetTable}.${row.record.sourceIdentitySha256}`);
    }
    const businessKey = `${row.record.plannedTargetTable}:${businessIdentitySha256}`;
    if (businessIdentities.has(businessKey)) fail("PRODUCTION_IMPORT_TARGET_MAP_DUPLICATE", businessKey);
    businessIdentities.add(businessKey);

    const afterCanonicalSha256 = computeProductionImportTargetCanonicalHash(
      row.record.plannedTargetTable,
      targetScope,
      row.payload,
      row.derivedFields,
      MODEL,
    );
    if (row.record.expectedTargetAfterSha256 !== afterCanonicalSha256) {
      fail("PRODUCTION_IMPORT_TARGET_CANONICAL_MISMATCH", `${row.record.plannedTargetTable}.${row.record.sourceIdentitySha256}`);
    }
    if (row.record.disposition === "insert") {
      const targetId = deriveProductionImportTargetId({
        targetScope,
        targetTable: row.record.plannedTargetTable,
        sourceIdentitySha256: row.record.sourceIdentitySha256,
      }, MODEL);
      if (row.record.targetId !== targetId) {
        fail("PRODUCTION_IMPORT_TARGET_IDENTITY_MISMATCH", `${row.record.plannedTargetTable}.${row.record.sourceIdentitySha256}`);
      }
    }
  }
}

function databaseWriteRow(row, targetScope, { expectedVersion = false } = {}) {
  return {
    id: row.record.targetId,
    tenant_id: targetScope.tenantId,
    park_id: targetScope.parkId,
    ...(expectedVersion ? { expected_version: row.record.expectedTargetVersionBefore } : {}),
    ...row.payload,
    ...row.derivedFields,
  };
}

async function selectAndVerifyExisting(tx, table, rule, rows, targetScope, afterWrite = false) {
  const storage = tableStorage(table);
  const columns = [...new Set(["id", ...(storage.versioned ? ["version"] : []), ...rule.fieldWhitelist, ...rule.derivedFields])];
  const projections = columns.map(column => table === "hr_employment_event" && column === "source_effective_at"
    ? `to_char(source_effective_at,'YYYY-MM-DD"T"HH24:MI:SS.US')||'+08:00' AS source_effective_at` : column);
  const result = rowsOf(await tx.query(
    `/* hr-prod-phase:lock-existing */${afterWrite ? " /* hr-prod-phase:verify-after */" : ""}
     SELECT ${projections.join(",")}${storage.versioned ? "" : ",1::integer AS version"}
     FROM ${table}
     WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[])${storage.softDelete ? " AND is_deleted=false" : ""}
     FOR UPDATE`,
    [targetScope.tenantId, targetScope.parkId, rows.map(row => row.record.targetId)],
  ), `lock ${table}`);
  const byId = new Map(result.map(row => [String(row.id), row]));
  if (result.length !== rows.length || byId.size !== rows.length) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_MATCH_REQUIRED", `${table} target count differs`);
  for (const row of rows) {
    const current = byId.get(row.record.targetId);
    if (!current || Number(current.version) !== row.record.expectedTargetVersionBefore) fail("PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED", `${table}.${row.record.targetId}`);
    const payload = Object.fromEntries(rule.fieldWhitelist.map(field => [field, normalizeDatabaseValue(table, rule, field, current[field])]));
    const derived = Object.fromEntries(rule.derivedFields.map(field => [field, current[field] === null ? null : String(current[field])]));
    const observed = computeProductionImportTargetCanonicalHash(table, targetScope, payload, derived, MODEL);
    if (observed !== row.record.expectedTargetBeforeSha256) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${table}.${row.record.targetId}`);
    row.targetBefore = { payload, derivedFields: derived, version: Number(current.version), canonicalSha256: observed };
  }
}

async function insertRows(tx, table, rule, rows, targetScope, batchSize) {
  const storage = tableStorage(table);
  const columns = ["id", "tenant_id", "park_id", ...rule.fieldWhitelist, ...rule.derivedFields, ...(storage.versioned ? ["version"] : [])];
  for (const part of chunks(rows, batchSize)) {
    const input = part.map(row => ({ ...databaseWriteRow(row, targetScope), ...(storage.versioned ? { version: 1 } : {}) }));
    const returned = rowsOf(await tx.query(
      `/* hr-prod-phase:bulk-insert:${table} */
       WITH src AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(${recordsetColumns(table, rule)}${storage.versioned ? ",version integer" : ""}))
       INSERT INTO ${table}(${columns.join(",")})
       SELECT ${columns.map(column => `src.${column}`).join(",")} FROM src
       RETURNING id::text,${storage.versioned ? "version" : "1::integer AS version"}`,
      [JSON.stringify(input)],
    ), `insert ${table}`);
    if (returned.length !== part.length || returned.some(row => Number(row.version) !== 1)) fail("PRODUCTION_IMPORT_TARGET_COLLISION", `${table} insert count/version differs`);
  }
}

async function mergeRows(tx, table, rule, rows, targetScope, batchSize) {
  if (rows.length > 0 && !tableStorage(table).versioned) fail("PRODUCTION_IMPORT_DISPOSITION_INVALID", `${table} is append-only`);
  const mutable = [...rule.fieldWhitelist, ...rule.derivedFields];
  for (const part of chunks(rows, batchSize)) {
    const returned = rowsOf(await tx.query(
      `/* hr-prod-phase:bulk-merge:${table} */
       WITH src AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(${recordsetColumns(table, rule, { withExpectedVersion: true })}))
       UPDATE ${table} target
       SET ${mutable.map(column => `${column}=src.${column}`).join(",")},version=target.version+1,update_time=now()
       FROM src
       WHERE target.id=src.id AND target.tenant_id=src.tenant_id AND target.park_id=src.park_id
         AND target.version=src.expected_version AND target.is_deleted=false
       RETURNING target.id::text,target.version`,
      [JSON.stringify(part.map(row => databaseWriteRow(row, targetScope, { expectedVersion: true })))],
    ), `merge ${table}`);
    const expected = new Map(part.map(row => [row.record.targetId, row.record.targetVersionAfter]));
    if (returned.length !== part.length || returned.some(row => Number(row.version) !== expected.get(String(row.id)))) fail("PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED", `${table} merge count/version differs`);
  }
}

async function writeBusinessRows(tx, layer, targetScope, batchSize) {
  const tables = new Map();
  for (const row of layer) if (row.record.disposition !== "quarantine") {
    const key = row.record.plannedTargetTable;
    if (!tables.has(key)) tables.set(key, []);
    tables.get(key).push(row);
  }
  for (const [table, rows] of tables) {
    const rule = MODEL.targetTables[table];
    const existing = rows.filter(row => ["merge", "skip_approved"].includes(row.record.disposition));
    for (const part of chunks(existing, batchSize)) await selectAndVerifyExisting(tx, table, rule, part, targetScope);
    await insertRows(tx, table, rule, rows.filter(row => row.record.disposition === "insert"), targetScope, batchSize);
    await mergeRows(tx, table, rule, rows.filter(row => row.record.disposition === "merge"), targetScope, batchSize);
  }
}

async function insertMapsAndReceipts(tx, operationId, phaseName, batchId, rows, batchSize) {
  for (const part of chunks(rows, batchSize)) {
    const mapped = part.filter(row => row.record.disposition !== "quarantine").map(row => ({
      source_system: row.record.sourceSystem,
      source_table: row.record.sourceTable,
      source_pk_canonical: row.record.sourcePkCanonical,
      source_identity_sha256: row.record.sourceIdentitySha256,
      source_row_sha256: row.record.sourceRowSha256,
      target_table: row.record.plannedTargetTable,
      target_id: row.record.targetId,
      mapping_status: row.record.disposition === "skip_approved" ? "verified" : "loaded",
    }));
    if (mapped.length) {
      const result = rowsOf(await tx.query(
        `/* hr-prod-phase:bulk-map-receipt */
         WITH src AS (SELECT * FROM jsonb_to_recordset($4::jsonb) AS row(source_system text,source_table text,source_pk_canonical text,source_identity_sha256 char(64),source_row_sha256 char(64),target_table text,target_id uuid,mapping_status text)),
         maps AS (
           INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
           SELECT $3::uuid,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,true FROM src
           RETURNING id,source_identity_sha256
         )
         INSERT INTO hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id)
         SELECT $1,$2,source_identity_sha256,$3::uuid,id FROM maps
         RETURNING source_identity_sha256`,
        [operationId, phaseName, batchId, JSON.stringify(mapped)],
      ), "insert projection maps");
      if (result.length !== mapped.length) fail("PRODUCTION_IMPORT_PROJECTION_RECEIPT_REQUIRED", `${phaseName} projection count differs`);
    }
    const quarantined = part.filter(row => row.record.disposition === "quarantine").map(row => ({
      source_system: row.record.sourceSystem,
      source_table: row.record.sourceTable,
      source_pk_canonical: row.record.sourcePkCanonical,
      source_identity_sha256: row.record.sourceIdentitySha256,
      source_row_sha256: row.record.sourceRowSha256,
      target_table: row.record.plannedTargetTable,
    }));
    if (quarantined.length) {
      const result = rowsOf(await tx.query(
        `/* hr-prod-phase:bulk-quarantine-map-receipt */
         WITH src AS (SELECT * FROM jsonb_to_recordset($4::jsonb) AS row(source_system text,source_table text,source_pk_canonical text,source_identity_sha256 char(64),source_row_sha256 char(64),target_table text)),
         maps AS (
           INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
           SELECT $3::uuid,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,NULL,'quarantined',true FROM src
           RETURNING id,source_identity_sha256
         )
         INSERT INTO hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id)
         SELECT $1,$2,source_identity_sha256,$3::uuid,id FROM maps
         RETURNING source_identity_sha256`,
        [operationId, phaseName, batchId, JSON.stringify(quarantined)],
      ), "insert quarantine maps");
      if (result.length !== quarantined.length) fail("PRODUCTION_IMPORT_QUARANTINE_PROJECTION_INVALID", `${phaseName} quarantine map count differs`);
    }
  }
}

async function encryptResults(rows, context, cryptoProvider) {
  const results = [];
  for (const row of rows) {
    const result = {
      sourceIdentitySha256: row.record.sourceIdentitySha256,
      disposition: row.record.disposition,
      ...(row.record.disposition === "quarantine" ? {} : {
        targetId: row.record.targetId,
        targetAfterSha256: row.record.expectedTargetAfterSha256,
        targetVersionAfter: row.record.targetVersionAfter,
      }),
    };
    if (row.record.disposition === "merge") {
      const encrypted = await cryptoProvider.encryptBeforeImage({ ...context, record: structuredClone(row.record), targetBefore: structuredClone(row.targetBefore) });
      const ciphertext = assertBuffer(encrypted?.ciphertext, 0, "before image ciphertext");
      const nonce = assertBuffer(encrypted?.nonce, 12, "before image nonce");
      const authenticationTag = assertBuffer(encrypted?.authenticationTag, 16, "before image authentication tag");
      if (sha256(ciphertext) !== row.record.beforeImage?.ciphertextSha256) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${context.phaseName}.${row.record.sourceIdentitySha256}`);
      result.beforeImage = { ciphertext, nonce, authenticationTag };
    }
    if (row.record.disposition === "quarantine") {
      const encrypted = await cryptoProvider.encryptQuarantine({ ...context, record: structuredClone(row.record), payload: structuredClone(row.payload) });
      const quarantineCiphertext = assertBuffer(encrypted?.ciphertext, 0, "quarantine ciphertext");
      const quarantineNonce = assertBuffer(encrypted?.nonce, 12, "quarantine nonce");
      const quarantineAuthenticationTag = assertBuffer(encrypted?.authenticationTag, 16, "quarantine authentication tag");
      if (sha256(quarantineCiphertext) !== row.record.quarantine?.payloadCiphertextSha256) fail("PRODUCTION_IMPORT_QUARANTINE_INVALID", `${context.phaseName}.${row.record.sourceIdentitySha256}`);
      Object.assign(result, { quarantineCiphertext, quarantineNonce, quarantineAuthenticationTag });
    }
    results.push(result);
  }
  return results;
}

async function finishBatch(tx, batchId, rows, phaseName) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.record.plannedTargetTable}\0${row.record.sourceTable}`;
    if (!groups.has(key)) groups.set(key, { domain: row.record.plannedTargetTable, source_object: row.record.sourceTable, extracted_count: 0, valid_count: 0, loaded_count: 0, rejected_count: 0 });
    const group = groups.get(key);
    group.extracted_count += 1;
    if (row.record.disposition === "quarantine") group.rejected_count += 1;
    else group.valid_count += 1;
    if (["insert", "merge"].includes(row.record.disposition)) group.loaded_count += 1;
  }
  const items = [...groups.values()];
  if (items.length) {
    const result = rowsOf(await tx.query(
      `/* hr-prod-phase:bulk-batch-items */
       WITH src AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS row(domain text,source_object text,extracted_count bigint,valid_count bigint,loaded_count bigint,rejected_count bigint))
       INSERT INTO migration_batch_item(batch_id,domain,source_object,phase,status,extracted_count,valid_count,loaded_count,rejected_count,checksum_sha256,started_at,finished_at)
       SELECT $1::uuid,domain,source_object,'load','succeeded',extracted_count,valid_count,loaded_count,rejected_count,NULL,now(),now() FROM src
       RETURNING id`,
      [batchId, JSON.stringify(items)],
    ), "insert migration batch items");
    if (result.length !== items.length) fail("PRODUCTION_IMPORT_PHASE_WRITER_DATABASE_RESULT_INVALID", `${phaseName} batch item count differs`);
  }
  const row = oneRow(await tx.query(
    `/* hr-prod-phase:finish-batch */
     UPDATE migration_batch
     SET status='succeeded',counts=$2::jsonb,finished_at=now(),update_time=now()
     WHERE id=$1::uuid AND status='running'
     RETURNING id::text`,
    [batchId, JSON.stringify({ extracted: rows.length, loaded: rows.filter(row => ["insert", "merge"].includes(row.record.disposition)).length, quarantined: rows.filter(row => row.record.disposition === "quarantine").length, approvedIgnored: rows.filter(row => row.record.disposition === "skip_approved").length })],
  ), "finish migration batch");
  if (row.id !== batchId) fail("PRODUCTION_IMPORT_PHASE_WRITER_DATABASE_RESULT_INVALID", `${phaseName} batch finish differs`);
}

async function writePhase(phaseName, input, options) {
  exactKeys(input, ["tx", "operationId", "targetScope", "phase", "payloadBundle"], [], `${phaseName} writer input`);
  if (!input.tx || typeof input.tx.query !== "function") fail("PRODUCTION_IMPORT_DATABASE_ADAPTER_REQUIRED", `${phaseName} tx missing`);
  if (typeof input.operationId !== "string" || !isObject(input.targetScope) || !SHA256.test(input.targetScope.scopeSha256 ?? "")) fail("PRODUCTION_IMPORT_PHASE_WRITER_INPUT_INVALID", `${phaseName} operation/scope invalid`);
  const rows = bindRows(input.phase, input.payloadBundle, phaseName);
  if (options.lab) {
    if (rows.some(row => !["insert", "quarantine"].includes(row.record.disposition))) fail("LAB_IMPORT_DISPOSITION_DENIED", "insert/quarantine only");
    if (input.payloadBundle.targetScope && ["tenantId", "parkId", "scopeSha256"].some(key => input.payloadBundle.targetScope[key] !== input.targetScope[key])) fail("LAB_IMPORT_SCOPE_DENIED", "payload scope differs");
    await validateLabTarget(input.tx, input.targetScope, options.lab);
  }
  if (!options.lab) {
    const present = [], absent = [];
    for (const table of [...new Set(rows.map(row => row.record.plannedTargetTable))].sort()) {
      const inserts = rows.filter(row => row.record.plannedTargetTable === table && row.record.disposition === "insert");
      for (const part of chunks(inserts, options.batchSize)) {
        // Include soft-deleted rows: any existing ID prevents a new insert.
        const found = rowsOf(await input.tx.query(`/* hr-prod-phase:before-absent */ SELECT id FROM ${table} WHERE id=ANY($1::uuid[]) FOR UPDATE`, [part.map(row => row.record.targetId)]), "insert absence");
        if (found.length) fail("PRODUCTION_IMPORT_INSERT_TARGET_EXISTS", table);
        absent.push(...part.map(row => ({ targetTable: table, targetId: row.record.targetId })));
      }
      const existing = rows.filter(row => row.record.plannedTargetTable === table && ["merge", "skip_approved"].includes(row.record.disposition));
      for (const part of chunks(existing, options.batchSize)) {
        await selectAndVerifyExisting(input.tx, table, MODEL.targetTables[table], part, input.targetScope);
        present.push(...part.map(row => ({ targetTable: table, targetId: row.record.targetId, version: row.targetBefore.version, payload: row.targetBefore.payload, derivedFields: row.targetBefore.derivedFields })));
      }
    }
    if (computeProductionImportTouchedPhaseBefore({ phase: phaseName, targetScope: input.targetScope, rows: present, absent }) !== input.phase.beforeCanonicalSha256) fail("PRODUCTION_IMPORT_PHASE_BEFORE_MISMATCH", phaseName);
  }
  const batchId = options.lab ? await createLabBatch(input.tx, phaseName, options.lab) : await createMigrationBatch(input.tx, input.operationId, phaseName);
  const businessIdentities = new Set();
  for (const layer of topologicalLayers(rows, phaseName)) {
    await resolveDependencies(input.tx, input.operationId, phaseName, layer, options.lab
      ? (identities, references) => lookupLabDependencies(input.tx, input.targetScope, phaseName, batchId, identities, references, options.lab) : undefined);
    verifyGeneratedSemantics(layer, input.targetScope, businessIdentities);
    await writeBusinessRows(input.tx, layer, input.targetScope, options.batchSize);
    if (options.lab) {
      await verifyInsertedRows(input.tx, layer, input.targetScope, options.batchSize);
      await insertLabMaps(input.tx, batchId, layer, options.batchSize);
    } else await insertMapsAndReceipts(input.tx, input.operationId, phaseName, batchId, layer, options.batchSize);
  }
  const verifiedAfter = [];
  for (const table of new Set(rows.map(row => row.record.plannedTargetTable))) {
    const touched = rows.filter(row => row.record.plannedTargetTable === table && row.record.disposition !== "quarantine");
    for (const part of chunks(touched, options.batchSize)) {
      const copies = part.map(row => ({ ...row, record: { ...row.record,
        expectedTargetBeforeSha256: row.record.expectedTargetAfterSha256, expectedTargetVersionBefore: row.record.targetVersionAfter } }));
      await selectAndVerifyExisting(input.tx, table, MODEL.targetTables[table], copies, input.targetScope, true);
      for (const row of copies) verifiedAfter.push({ targetTable: table, targetId: row.record.targetId, version: row.targetBefore.version,
        payload: row.targetBefore.payload, derivedFields: row.targetBefore.derivedFields });
    }
  }
  const afterCanonicalSha256 = computeProductionImportTouchedPhaseState({ phase: phaseName, targetScope: input.targetScope, rows: verifiedAfter });
  const results = await encryptResults(rows, { operationId: input.operationId, phaseName, targetScope: structuredClone(input.targetScope) }, options.cryptoProvider);
  await finishBatch(input.tx, batchId, rows, phaseName);
  return {
    payloadBundleArtifactSha256: input.phase.payloadBundleArtifactSha256,
    payloadBundleSha256: input.phase.payloadBundleSha256,
    canonicalizationVersion: input.phase.canonicalizationVersion,
    targetScopeSha256: input.targetScope.scopeSha256,
    afterCanonicalSha256,
    records: results,
    ...(options.lab ? { batchId, productionImport: "HOLD" } : {}),
  };
}

async function validateLabTarget(tx, scope, lab) {
  if ([scope.tenantId, scope.parkId].some(value => typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value))) fail("LAB_IMPORT_SCOPE_DENIED", "scope required");
  const target = oneRow(await tx.query(
    `/* hr-lab-phase:target */ SELECT current_database() AS database_name,
     EXISTS (SELECT 1 FROM sys_tenant WHERE btrim(tenant_id::text)=$1 AND status=1 AND is_deleted=false
       AND (expire_time IS NULL OR expire_time>clock_timestamp())) AS tenant_exists,
     EXISTS (SELECT 1 FROM biz_park WHERE btrim(tenant_id::text)=$1 AND btrim(park_id::text)=$2
       AND status=1 AND is_deleted=false) AS park_exists`, [scope.tenantId, scope.parkId],
  ), "lab target");
  if (target.database_name !== lab.expectedDatabase) fail("LAB_IMPORT_DATABASE_DENIED", "exact lab database required");
  if (target.tenant_exists !== true || target.park_exists !== true) fail("LAB_IMPORT_SCOPE_DENIED", "active owned scope required");
}

async function createLabBatch(tx, phaseName, lab) {
  const row = oneRow(await tx.query(
    `/* hr-lab-phase:create-batch */
     INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,counts,started_at,execution_context)
     VALUES ($1,$2,$3,current_database(),'load','running',$4,'{}'::jsonb,now(),'lab_rehearsal') RETURNING id::text AS id`,
    [`${lab.runId}-${phaseName.toLowerCase()}`, MODEL.sourceSystem, lab.sourceSnapshotHash, lab.toolVersion],
  ), "lab batch");
  if (!UUID.test(row.id ?? "")) fail("PRODUCTION_IMPORT_PHASE_WRITER_DATABASE_RESULT_INVALID", "lab batch id invalid");
  return row.id;
}

async function lookupLabDependencies(tx, scope, phaseName, batchId, identities, references, lab) {
  const requested = [...new Set(references.map(ref => ref.phase))].map(phase => ({ phase, run_id: `${lab.runId}-${phase.toLowerCase()}` }));
  const result = rowsOf(await tx.query(
    `/* hr-lab-phase:resolve-dependencies */
     WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS ref(phase text,run_id text))
     SELECT map.source_identity_sha256,map.target_table,map.target_id::text,map.mapping_status,requested.phase
     FROM requested JOIN migration_batch batch ON batch.run_id=requested.run_id
     JOIN legacy_record_map map ON map.batch_id=batch.id
     WHERE batch.execution_context='lab_rehearsal' AND batch.target_database=$2
       AND batch.source_snapshot_sha256=$3 AND batch.tool_version=$4 AND batch.source_system=$5
       AND ((requested.phase=$6 AND batch.id=$7::uuid AND batch.status='running')
         OR (requested.phase<>$6 AND batch.status='succeeded'))
       AND map.source_identity_sha256=ANY($8::char(64)[]) AND map.is_active
       AND map.mapping_status IN ('loaded','quarantined')`,
    [JSON.stringify(requested), lab.expectedDatabase, lab.sourceSnapshotHash, lab.toolVersion, MODEL.sourceSystem, phaseName, batchId, identities],
  ), "lab dependencies");
  if (new Set(result.map(row => row.source_identity_sha256)).size !== result.length) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", "ambiguous lab map");
  // A batch has no scope columns: prove each mapped parent belongs to this scope.
  for (const table of new Set(result.map(row => row.target_table))) {
    if (!MODEL.targetTables[table]) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", "unknown lab target");
    const ids = result.filter(row => row.target_table === table && row.mapping_status === "loaded").map(row => row.target_id);
    if (!ids.length) continue;
    const scoped = rowsOf(await tx.query(
      `/* hr-lab-phase:parent-scope */ SELECT id::text FROM ${table}
       WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[])${tableStorage(table).softDelete ? " AND is_deleted=false" : ""} FOR SHARE`,
      [scope.tenantId, scope.parkId, ids],
    ), "lab parent scope");
    const observed = new Set(scoped.map(row => row.id));
    if (ids.some(id => !observed.has(id))) fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", "parent scope differs");
  }
  return result;
}

async function verifyInsertedRows(tx, layer, scope, batchSize) {
  for (const table of new Set(layer.map(row => row.record.plannedTargetTable))) {
    const inserted = layer.filter(row => row.record.plannedTargetTable === table && row.record.disposition === "insert");
    for (const part of chunks(inserted, batchSize)) await selectAndVerifyExisting(tx, table, MODEL.targetTables[table], part.map(row => ({ ...row,
      record: { ...row.record, expectedTargetBeforeSha256: row.record.expectedTargetAfterSha256, expectedTargetVersionBefore: 1 },
    })), scope);
  }
}

async function insertLabMaps(tx, batchId, layer, batchSize) {
  for (const part of chunks(layer, batchSize)) {
    const maps = part.map(({ record }) => ({ source_system: record.sourceSystem, source_table: record.sourceTable,
      source_pk_canonical: record.sourcePkCanonical, source_identity_sha256: record.sourceIdentitySha256, source_row_sha256: record.sourceRowSha256,
      target_table: record.plannedTargetTable, target_id: record.disposition === "quarantine" ? null : record.targetId,
      mapping_status: record.disposition === "quarantine" ? "quarantined" : "loaded" }));
    const inserted = rowsOf(await tx.query(
      `/* hr-lab-phase:insert-maps */ WITH src AS (SELECT * FROM jsonb_to_recordset($2::jsonb)
       AS row(source_system text,source_table text,source_pk_canonical text,source_identity_sha256 char(64),source_row_sha256 char(64),target_table text,target_id uuid,mapping_status text))
       INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
       SELECT $1::uuid,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,true FROM src
       RETURNING source_identity_sha256`, [batchId, JSON.stringify(maps)],
    ), "lab maps");
    if (inserted.length !== maps.length || new Set(inserted.map(row => row.source_identity_sha256)).size !== maps.length || inserted.some(row => !maps.some(map => map.source_identity_sha256 === row.source_identity_sha256))) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", "lab map count differs");
  }
}

/** Laboratory metadata strategy; caller owns transaction and endpoint isolation. */
export function createLabImportPhaseWriters(options) {
  exactKeys(options, ["cryptoProvider", "expectedDatabase", "codeSha", "sourceSnapshotHash", "runId"], ["batchSize"], "lab writer options");
  if (!/^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u.test(options.expectedDatabase ?? "") || options.expectedDatabase.length > 63 ||
      !/^[0-9a-f]{40}$/u.test(options.codeSha ?? "") || !SHA256.test(options.sourceSnapshotHash ?? "") ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{5,59}$/u.test(options.runId ?? "")) fail("LAB_IMPORT_BINDING_INVALID", "lab run binding invalid");
  // Apply the identical batching and encryption-provider contract.
  createProductionImportPhaseWriters({ cryptoProvider: options.cryptoProvider, ...(options.batchSize === undefined ? {} : { batchSize: options.batchSize }) });
  const lab = Object.freeze({ expectedDatabase: options.expectedDatabase, codeSha: options.codeSha, sourceSnapshotHash: options.sourceSnapshotHash,
    runId: options.runId, toolVersion: `lab-import-v1@${options.codeSha}` });
  const config = Object.freeze({ lab, cryptoProvider: options.cryptoProvider, batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE });
  return Object.freeze(Object.fromEntries(PHASES.map(phase => [phase, input => writePhase(phase, input, config)])));
}

/**
 * Creates fixed T0-T3 bulk writers. The caller owns the SERIALIZABLE
 * transaction and injects encryption; this module has no connection, env,
 * CLI, authorization, or key-loading path.
 */
export function createProductionImportPhaseWriters(options) {
  exactKeys(options, ["cryptoProvider"], ["batchSize"], "phase writer options");
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(batchSize) || batchSize < MIN_BATCH_SIZE || batchSize > MAX_BATCH_SIZE) fail("PRODUCTION_IMPORT_PHASE_WRITER_BATCH_SIZE_INVALID", `batchSize must be ${MIN_BATCH_SIZE}-${MAX_BATCH_SIZE}`);
  if (!options.cryptoProvider || typeof options.cryptoProvider.encryptBeforeImage !== "function" || typeof options.cryptoProvider.encryptQuarantine !== "function") fail("PRODUCTION_IMPORT_PHASE_WRITER_CRYPTO_REQUIRED", "both encryption operations must be injected");
  const config = Object.freeze({ batchSize, cryptoProvider: options.cryptoProvider });
  return Object.freeze(Object.fromEntries(PHASES.map(phase => [phase, input => writePhase(phase, input, config)])));
}

export const PRODUCTION_IMPORT_PHASE_WRITER_TABLES = Object.freeze(Object.keys(MODEL.targetTables));
export const PRODUCTION_IMPORT_PHASE_WRITER_BATCH_LIMITS = Object.freeze({ minimum: MIN_BATCH_SIZE, maximum: MAX_BATCH_SIZE, default: DEFAULT_BATCH_SIZE });

/** Internal T0 business-row primitive; the laboratory wrapper owns isolation. */
export async function probeT0BusinessRows(input, beforeWrite) {
  const tx = input.tx;
  if (input.payloadBundle?.targetScope && ["tenantId", "parkId", "scopeSha256"].some(key => input.payloadBundle.targetScope[key] !== input.targetScope[key])) fail("T0_BUSINESS_PROBE_SCOPE_DENIED", "payload scope differs");
  const rows = bindRows(input.phase, input.payloadBundle, "T0");
  if (!rows.length || rows.some(row => !["insert", "quarantine"].includes(row.record.disposition) || (row.record.phase !== undefined && row.record.phase !== "T0"))) fail("T0_BUSINESS_PROBE_DISPOSITION_DENIED", "nonempty T0 insert/quarantine only");
  const tableRows = new Map(Object.entries(MODEL.targetTables).filter(([, rule]) => rule.phase === "T0")
    .map(([table]) => [table, rows.filter(row => row.record.plannedTargetTable === table && row.record.disposition === "insert")]));
  await beforeWrite(tableRows);
  const completed = new Map();
  const identities = new Set();
  for (const layer of topologicalLayers(rows, "T0")) {
    for (const row of layer) {
      const roles = new Set();
      for (const ref of row.record.dependencyRefs) {
        const spec = row.rule.foreignKeys.find(candidate => candidate.dependencyRole === ref.role);
        if (!spec || roles.has(ref.role) || ref.phase !== "T0" || MODEL.targetTables[ref.expectedTargetTable]?.phase !== "T0" || spec.targetTable !== ref.expectedTargetTable) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", "invalid T0 reference");
        roles.add(ref.role);
        const parent = completed.get(ref.sourceIdentitySha256);
        if (!parent || parent.plannedTargetTable !== spec.targetTable || (row.record.disposition === "insert" && parent.disposition !== "insert")) fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", "completed parent required");
        row.derivedFields[spec.column] = parent.targetId ?? null;
      }
      for (const spec of row.rule.foreignKeys) {
        if (row.record.disposition === "insert" && spec.required && !roles.has(spec.dependencyRole)) fail("PRODUCTION_IMPORT_DEPENDENCY_REQUIRED", "required parent absent");
        row.derivedFields[spec.column] ??= null;
      }
    }
    verifyGeneratedSemantics(layer, input.targetScope, identities);
    await writeBusinessRows(tx, layer, input.targetScope, DEFAULT_BATCH_SIZE);
    for (const [table] of tableRows) {
      const inserted = layer.filter(row => row.record.plannedTargetTable === table && row.record.disposition === "insert");
      for (const part of chunks(inserted, DEFAULT_BATCH_SIZE)) {
        await selectAndVerifyExisting(tx, table, MODEL.targetTables[table], part.map(row => ({ ...row,
          record: { ...row.record, expectedTargetBeforeSha256: row.record.expectedTargetAfterSha256, expectedTargetVersionBefore: 1 },
        })), input.targetScope);
      }
    }
    for (const row of layer) completed.set(row.record.sourceIdentitySha256, row.record);
  }
  return { productionImport: "HOLD", phase: "T0", validation: "business_rows_only",
    cryptographicMapsValidated: false, quarantineStorage: "external_encrypted_artifact_not_validated",
    sourceCount: rows.length, insertedCount: rows.filter(row => row.record.disposition === "insert").length,
    quarantinedCount: rows.filter(row => row.record.disposition === "quarantine").length };
}
