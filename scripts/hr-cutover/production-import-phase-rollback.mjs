import { createHash } from "node:crypto";
import { normalizeProductionT1LocalTimestamp } from "./production-t1-local-timestamp.mjs";

import { ProductionImportExecutionError } from "./production-import-sealed-plan-lib.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportTargetCanonicalHash,
} from "./production-import-target-model.mjs";

const PHASES = Object.freeze(["T0", "T1", "T2", "T3"]);
const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DEFAULT_BATCH_SIZE = 1000;
const MIN_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 2000;
const MODEL = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL;
const TABLE_STORAGE = Object.freeze({
  hr_contract_legacy_evidence: Object.freeze({ versioned: false, softDelete: false, updateTimestamp: false, fieldTypes: Object.freeze({ protected_file_id: "uuid", size_bytes: "bigint" }) }),
  hr_employment_event: Object.freeze({ localTimestampFields: Object.freeze(["source_effective_at"]) }),
  hr_contract_change: Object.freeze({ localTimestampFields: Object.freeze(["signed_at"]) }),
});

const fail = (code, detail) => { throw new ProductionImportExecutionError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));

function exactKeys(value, required, optional, label) {
  if (!isObject(value)) fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_INPUT_INVALID", `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.has(key))) {
    fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_INPUT_INVALID", `${label} keys differ`);
  }
}

function rowsOf(result, label) {
  if (!result || !Array.isArray(result.rows)) fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_DATABASE_RESULT_INVALID", `${label} returned no rows`);
  return result.rows;
}

function tableStorage(table) {
  return TABLE_STORAGE[table] ?? { versioned: true, softDelete: true, updateTimestamp: true };
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

function normalizeDatabaseValue(table, rule, field, value) {
  if (value === null || value === undefined) return value ?? null;
  if (table === "hr_employment_event" && field === "source_effective_at") {
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

function canonicalFromDatabase(table, rule, targetScope, row) {
  const payload = Object.fromEntries(rule.fieldWhitelist.map(field => [field, normalizeDatabaseValue(table, rule, field, row[field])]));
  const derivedFields = Object.fromEntries(rule.derivedFields.map(field => [field, row[field] === null || row[field] === undefined ? null : String(row[field])]));
  return {
    payload,
    derivedFields,
    canonicalSha256: computeProductionImportTargetCanonicalHash(table, targetScope, payload, derivedFields, MODEL),
  };
}

function validateRequestedRecords(phaseName, records) {
  if (!PHASES.includes(phaseName) || !Array.isArray(records)) fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_INPUT_INVALID", "phase/records invalid");
  const seen = new Set();
  return records.map((record, inputOrdinal) => {
    if (!isObject(record) || !SHA256.test(record.sourceIdentitySha256 ?? "") || seen.has(record.sourceIdentitySha256)) {
      fail(seen.has(record?.sourceIdentitySha256) ? "PRODUCTION_IMPORT_SOURCE_DUPLICATE" : "PRODUCTION_IMPORT_PHASE_ROLLBACK_INPUT_INVALID", `${phaseName}.${record?.sourceIdentitySha256 ?? "unknown"}`);
    }
    seen.add(record.sourceIdentitySha256);
    const rule = MODEL.targetTables[record.plannedTargetTable];
    if (!rule || rule.phase !== phaseName || !rule.allowedDispositions.includes(record.disposition)) fail("PRODUCTION_IMPORT_TARGET_TABLE_DENIED", `${phaseName}.${record.plannedTargetTable ?? "unknown"}`);
    return { inputOrdinal, planned: record };
  });
}

async function lockControlRows(tx, operationId, phaseName, requested) {
  const input = requested.map(({ inputOrdinal, planned }) => ({ source_identity_sha256: planned.sourceIdentitySha256, input_ordinal: inputOrdinal }));
  const rows = rowsOf(await tx.query(
    `/* hr-prod-phase-rollback:lock-control */
     WITH requested AS (
       SELECT * FROM jsonb_to_recordset($3::jsonb)
         AS row(source_identity_sha256 char(64),input_ordinal integer)
     )
     SELECT requested.input_ordinal,record.source_identity_sha256,record.disposition,
            record.planned_target_table,record.target_table,record.target_id::text,
            record.expected_target_before_sha256,record.target_after_sha256,
            record.expected_target_version_before,record.target_version_after,record.rollback_status,
            operation.target_tenant_id,operation.target_park_id,operation.target_scope_sha256,
            before_image.plaintext_sha256,before_image.ciphertext_sha256,
            before_image.key_reference_sha256,before_image.nonce,
            before_image.authentication_tag,before_image.ciphertext,before_image.algorithm,
            receipt.legacy_record_map_id::text,receipt.migration_batch_id::text,
            map.target_table AS map_target_table,map.target_id::text AS map_target_id,
            map.mapping_status,map.is_active,
            batch.production_import_operation_id,batch.production_import_phase
     FROM requested
     JOIN hr_yuzhou_production_import_record record
       ON record.operation_id=$1 AND record.phase=$2
      AND record.source_identity_sha256=requested.source_identity_sha256
     JOIN hr_yuzhou_production_import_operation operation ON operation.operation_id=record.operation_id
     LEFT JOIN hr_yuzhou_production_import_before_image before_image
       ON (before_image.operation_id,before_image.phase,before_image.source_identity_sha256)=
          (record.operation_id,record.phase,record.source_identity_sha256)
     JOIN hr_yuzhou_production_import_projection_receipt receipt
       ON (receipt.operation_id,receipt.phase,receipt.source_identity_sha256)=
          (record.operation_id,record.phase,record.source_identity_sha256)
     JOIN legacy_record_map map ON map.id=receipt.legacy_record_map_id
     JOIN migration_batch batch ON batch.id=receipt.migration_batch_id
     ORDER BY requested.input_ordinal
     FOR UPDATE OF record,map`,
    [operationId, phaseName, JSON.stringify(input)],
  ), "lock rollback controls");
  if (rows.length !== requested.length) fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_CONTROL_MISMATCH", `${phaseName} control count differs`);
  return rows;
}

async function validateReverseDependencyOrder(tx, operationId, phaseName, controls) {
  const ordinalBySource = new Map(controls.map(row => [row.source_identity_sha256, Number(row.input_ordinal)]));
  const dependencies = rowsOf(await tx.query(
    `/* hr-prod-phase-rollback:dependency-order */
     SELECT source_identity_sha256,depends_on_phase,depends_on_source_identity_sha256
     FROM hr_yuzhou_production_import_record_dependency
     WHERE operation_id=$1 AND phase=$2
       AND source_identity_sha256=ANY($3::char(64)[])`,
    [operationId, phaseName, [...ordinalBySource.keys()]],
  ), "rollback dependencies");
  for (const dependency of dependencies) {
    if (dependency.depends_on_phase !== phaseName) continue;
    const childOrdinal = ordinalBySource.get(dependency.source_identity_sha256);
    const parentOrdinal = ordinalBySource.get(dependency.depends_on_source_identity_sha256);
    if (parentOrdinal === undefined || childOrdinal === undefined || childOrdinal >= parentOrdinal) {
      fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_ORDER_INVALID", `${phaseName} must be reverse dependency order`);
    }
  }
}

function bindAndValidateControls(operationId, phaseName, requested, controls) {
  return controls.map((control, index) => {
    const planned = requested[index].planned;
    const rule = MODEL.targetTables[control.planned_target_table];
    if (Number(control.input_ordinal) !== index || control.source_identity_sha256 !== planned.sourceIdentitySha256 || !rule || rule.phase !== phaseName || control.planned_target_table !== planned.plannedTargetTable || control.disposition !== planned.disposition || control.rollback_status !== "not_started") {
      fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_CONTROL_MISMATCH", `${phaseName}.${planned.sourceIdentitySha256}`);
    }
    const hasTarget = control.disposition !== "quarantine";
    if (hasTarget && (control.target_table !== control.planned_target_table || control.target_id !== planned.targetId || !UUID.test(control.target_id ?? "") || control.target_after_sha256 !== planned.expectedTargetAfterSha256 || Number(control.target_version_after) !== planned.targetVersionAfter)) {
      fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_CONTROL_MISMATCH", `${phaseName}.${planned.sourceIdentitySha256} target differs`);
    }
    if (!hasTarget && (control.target_table !== null || control.target_id !== null)) fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_CONTROL_MISMATCH", `${phaseName}.${planned.sourceIdentitySha256} quarantine target differs`);
    if (control.production_import_operation_id !== operationId || control.production_import_phase !== phaseName || !UUID.test(control.legacy_record_map_id ?? "") || !UUID.test(control.migration_batch_id ?? "") || control.map_target_table !== control.planned_target_table || control.map_target_id !== control.target_id || control.is_active !== true) {
      fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_PROJECTION_MISMATCH", `${phaseName}.${planned.sourceIdentitySha256}`);
    }
    if (!SHA256.test(control.target_scope_sha256 ?? "") || typeof control.target_tenant_id !== "string" || typeof control.target_park_id !== "string") fail("PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH", operationId);
    if (control.disposition === "merge" && (!SHA256.test(control.plaintext_sha256 ?? "") || control.plaintext_sha256 !== control.expected_target_before_sha256 || control.expected_target_before_sha256 !== planned.expectedTargetBeforeSha256 || Number(control.expected_target_version_before) !== planned.expectedTargetVersionBefore || !Buffer.isBuffer(control.ciphertext) || !Buffer.isBuffer(control.nonce) || !Buffer.isBuffer(control.authentication_tag) || sha256(control.ciphertext) !== control.ciphertext_sha256)) {
      fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${phaseName}.${planned.sourceIdentitySha256}`);
    }
    if (control.disposition !== "merge" && control.ciphertext !== null && control.ciphertext !== undefined) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${phaseName}.${planned.sourceIdentitySha256} unexpected before image`);
    return {
      control,
      planned,
      rule,
      targetScope: { tenantId: control.target_tenant_id, parkId: control.target_park_id, scopeSha256: control.target_scope_sha256 },
    };
  });
}

async function lockAndVerifyBusinessRows(tx, table, rule, entries, targetScope, expectedState) {
  const storage = tableStorage(table);
  const columns = [...new Set(["id", ...(storage.versioned ? ["version"] : []), ...rule.fieldWhitelist, ...rule.derivedFields])];
  const projections = columns.map(column => table === "hr_employment_event" && column === "source_effective_at"
    ? `to_char(source_effective_at,'YYYY-MM-DD"T"HH24:MI:SS.US')||'+08:00' AS source_effective_at` : column);
  const rows = rowsOf(await tx.query(
    `/* hr-prod-phase-rollback:lock-business:${table} */
     SELECT ${projections.join(",")}${storage.versioned ? "" : ",1::integer AS version"}
     FROM ${table}
     WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[])${storage.softDelete ? " AND is_deleted=false" : ""}
     FOR UPDATE`,
    [targetScope.tenantId, targetScope.parkId, entries.map(entry => entry.control.target_id)],
  ), `lock rollback ${table}`);
  const byId = new Map(rows.map(row => [String(row.id), row]));
  if (byId.size !== entries.length) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_MATCH_REQUIRED", `${table} rollback target count differs`);
  for (const entry of entries) {
    const current = byId.get(entry.control.target_id);
    const version = Number(current?.version);
    if (!current || version !== Number(entry.control.target_version_after)) fail("PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED", `${table}.${entry.control.target_id}`);
    const canonical = canonicalFromDatabase(table, rule, targetScope, current);
    if (canonical.canonicalSha256 !== entry.control.target_after_sha256) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${table}.${entry.control.target_id}`);
    entry.current = { ...canonical, version };
    if (expectedState === "insert" && entry.control.disposition !== "insert") fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_CONTROL_MISMATCH", `${table} insert set differs`);
  }
}

async function deleteInsertedRows(tx, table, rule, entries, targetScope, batchSize) {
  const storage = tableStorage(table);
  for (const part of chunks(entries, batchSize)) {
    await lockAndVerifyBusinessRows(tx, table, rule, part, targetScope, "insert");
    const input = part.map(entry => ({ id: entry.control.target_id, expected_version: Number(entry.control.target_version_after) }));
    const rows = rowsOf(await tx.query(
      `/* hr-prod-phase-rollback:bulk-delete-insert:${table} */
       WITH src AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(id uuid,expected_version integer))
       DELETE FROM ${table} target USING src
       WHERE target.id=src.id AND target.tenant_id=$1 AND target.park_id=$2${storage.versioned ? " AND target.version=src.expected_version" : ""}${storage.softDelete ? " AND target.is_deleted=false" : ""}
       RETURNING target.id::text`,
      [targetScope.tenantId, targetScope.parkId, JSON.stringify(input)],
    ), `delete inserted ${table}`);
    if (rows.length !== part.length) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${table} insert delete count differs`);
  }
}

function validateDecryptedBefore(entry, decrypted) {
  if (!isObject(decrypted) || decrypted.plaintextSha256 !== entry.control.plaintext_sha256 || !isObject(decrypted.targetBefore)) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${entry.control.source_identity_sha256} decrypted shape invalid`);
  const targetBefore = decrypted.targetBefore;
  exactKeys(targetBefore, ["payload", "derivedFields", "version", "canonicalSha256"], [], "decrypted targetBefore");
  if (!isObject(targetBefore.payload) || !isObject(targetBefore.derivedFields) || Object.keys(targetBefore.payload).sort().join("\0") !== [...entry.rule.fieldWhitelist].sort().join("\0") || Object.keys(targetBefore.derivedFields).sort().join("\0") !== [...entry.rule.derivedFields].sort().join("\0")) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${entry.control.source_identity_sha256} decrypted fields invalid`);
  if (targetBefore.version !== Number(entry.control.expected_target_version_before) || targetBefore.canonicalSha256 !== entry.control.expected_target_before_sha256) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${entry.control.source_identity_sha256} decrypted CAS invalid`);
  const observed = computeProductionImportTargetCanonicalHash(entry.control.target_table, entry.targetScope, targetBefore.payload, targetBefore.derivedFields, MODEL);
  if (observed !== entry.control.plaintext_sha256 || observed !== targetBefore.canonicalSha256) fail("PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${entry.control.source_identity_sha256} plaintext canonical hash invalid`);
  return structuredClone(targetBefore);
}

async function restoreMergedRows(tx, table, rule, entries, targetScope, batchSize, cryptoProvider) {
  const storage = tableStorage(table);
  if (entries.length > 0 && !storage.versioned) fail("PRODUCTION_IMPORT_DISPOSITION_INVALID", `${table} is append-only`);
  const columns = [...rule.fieldWhitelist, ...rule.derivedFields];
  for (const part of chunks(entries, batchSize)) {
    await lockAndVerifyBusinessRows(tx, table, rule, part, targetScope, "merge");
    for (const entry of part) {
      const decrypted = await cryptoProvider.decryptBeforeImage({
        operationId: entry.control.production_import_operation_id,
        phaseName: entry.control.production_import_phase,
        record: structuredClone(entry.planned),
        envelope: {
          algorithm: entry.control.algorithm,
          keyReferenceSha256: entry.control.key_reference_sha256,
          nonce: entry.control.nonce,
          authenticationTag: entry.control.authentication_tag,
          ciphertext: entry.control.ciphertext,
        },
      });
      entry.targetBefore = validateDecryptedBefore(entry, decrypted);
    }
    const input = part.map(entry => ({
      id: entry.control.target_id,
      expected_version: Number(entry.control.target_version_after),
      restored_version: Number(entry.control.expected_target_version_before),
      ...entry.targetBefore.payload,
      ...entry.targetBefore.derivedFields,
    }));
    const recordset = ["id uuid", "expected_version integer", "restored_version integer", ...columns.map(field => `${field} ${sqlType(table, rule, field)}`)].join(",");
    const rows = rowsOf(await tx.query(
      `/* hr-prod-phase-rollback:bulk-restore-merge:${table} */
       WITH src AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(${recordset}))
       UPDATE ${table} target
       SET ${columns.map(column => `${column}=src.${column}`).join(",")},version=src.restored_version,update_time=now()
       FROM src
       WHERE target.id=src.id AND target.tenant_id=$1 AND target.park_id=$2
         AND target.version=src.expected_version AND target.is_deleted=false
       RETURNING target.id::text,target.version`,
      [targetScope.tenantId, targetScope.parkId, JSON.stringify(input)],
    ), `restore merged ${table}`);
    const expected = new Map(part.map(entry => [entry.control.target_id, Number(entry.control.expected_target_version_before)]));
    if (rows.length !== part.length || rows.some(row => Number(row.version) !== expected.get(String(row.id)))) fail("PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED", `${table} merge restore count/version differs`);
  }
}

async function deactivateProjectionMaps(tx, operationId, phaseName, entries, batchSize) {
  for (const part of chunks(entries, batchSize)) {
    const input = part.map(entry => ({ source_identity_sha256: entry.control.source_identity_sha256, legacy_record_map_id: entry.control.legacy_record_map_id }));
    const rows = rowsOf(await tx.query(
      `/* hr-prod-phase-rollback:bulk-deactivate-projection-maps */
       WITH src AS (
         SELECT * FROM jsonb_to_recordset($3::jsonb)
           AS row(source_identity_sha256 char(64),legacy_record_map_id uuid)
       )
       UPDATE legacy_record_map map
       SET is_active=false,mapping_status='rolled_back',update_time=now()
       FROM src
       JOIN hr_yuzhou_production_import_projection_receipt receipt
         ON receipt.operation_id=$1 AND receipt.phase=$2
        AND receipt.source_identity_sha256=src.source_identity_sha256
        AND receipt.legacy_record_map_id=src.legacy_record_map_id
       JOIN migration_batch batch ON batch.id=receipt.migration_batch_id
       WHERE map.id=receipt.legacy_record_map_id
         AND batch.execution_context='production_import'
         AND batch.production_import_operation_id=$1
         AND batch.production_import_phase=$2
         AND map.is_active
       RETURNING map.id::text`,
      [operationId, phaseName, JSON.stringify(input)],
    ), "deactivate projection maps");
    if (rows.length !== part.length) fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_PROJECTION_MISMATCH", `${phaseName} map deactivation count differs`);
  }
}

async function rollbackPhase(input, options) {
  exactKeys(input, ["tx", "operationId", "phase", "records"], [], "phase rollback input");
  if (!input.tx || typeof input.tx.query !== "function" || typeof input.operationId !== "string") fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_INPUT_INVALID", "transaction/operation invalid");
  const requested = validateRequestedRecords(input.phase, input.records);
  if (requested.length === 0) return [];
  const controls = await lockControlRows(input.tx, input.operationId, input.phase, requested);
  await validateReverseDependencyOrder(input.tx, input.operationId, input.phase, controls);
  const entries = bindAndValidateControls(input.operationId, input.phase, requested, controls);
  const scope = entries[0].targetScope;
  if (entries.some(entry => entry.targetScope.tenantId !== scope.tenantId || entry.targetScope.parkId !== scope.parkId || entry.targetScope.scopeSha256 !== scope.scopeSha256)) fail("PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH", input.operationId);

  const tables = new Map();
  for (const entry of entries) {
    if (!["insert", "merge"].includes(entry.control.disposition)) continue;
    if (!tables.has(entry.control.target_table)) tables.set(entry.control.target_table, []);
    tables.get(entry.control.target_table).push(entry);
  }
  for (const [table, tableEntries] of tables) {
    const rule = MODEL.targetTables[table];
    await deleteInsertedRows(input.tx, table, rule, tableEntries.filter(entry => entry.control.disposition === "insert"), scope, options.batchSize);
    await restoreMergedRows(input.tx, table, rule, tableEntries.filter(entry => entry.control.disposition === "merge"), scope, options.batchSize, options.cryptoProvider);
  }
  await deactivateProjectionMaps(input.tx, input.operationId, input.phase, entries, options.batchSize);

  return entries.map(entry => ({
    sourceIdentitySha256: entry.control.source_identity_sha256,
    rollbackStatus: { insert: "deleted_insert", merge: "restored_merge", quarantine: "quarantine_noop", skip_approved: "skip_noop" }[entry.control.disposition],
    ...(entry.control.disposition === "merge" ? {
      observedCurrentSha256: entry.current.canonicalSha256,
      restoredSha256: entry.targetBefore.canonicalSha256,
      casApplied: true,
    } : {}),
  }));
}

/**
 * Creates an operation-scoped bulk rollback adapter. The caller owns the
 * SERIALIZABLE transaction and injects decryption; this module never opens a
 * connection, reads environment variables, loads credentials, or exposes a CLI.
 */
export function createProductionImportPhaseRollback(options) {
  exactKeys(options, ["cryptoProvider"], ["batchSize"], "phase rollback options");
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(batchSize) || batchSize < MIN_BATCH_SIZE || batchSize > MAX_BATCH_SIZE) fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_BATCH_SIZE_INVALID", `batchSize must be ${MIN_BATCH_SIZE}-${MAX_BATCH_SIZE}`);
  if (!options.cryptoProvider || typeof options.cryptoProvider.decryptBeforeImage !== "function") fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_CRYPTO_REQUIRED", "decryptBeforeImage must be injected");
  const config = Object.freeze({ batchSize, cryptoProvider: options.cryptoProvider });
  return input => rollbackPhase(input, config);
}

export const PRODUCTION_IMPORT_PHASE_ROLLBACK_TABLES = Object.freeze(Object.keys(MODEL.targetTables));
export const PRODUCTION_IMPORT_PHASE_ROLLBACK_BATCH_LIMITS = Object.freeze({ minimum: MIN_BATCH_SIZE, maximum: MAX_BATCH_SIZE, default: DEFAULT_BATCH_SIZE });

function labReverseLayers(requested, phase) {
  const local = new Map(requested.map(entry => [entry.planned.sourceIdentitySha256, entry]));
  const children = new Map(requested.map(entry => [entry.planned.sourceIdentitySha256, new Set()]));
  for (const entry of requested) {
    const row = entry.planned, rule = MODEL.targetTables[row.plannedTargetTable], roles = new Set();
    if (!Array.isArray(row.dependencyRefs)) fail("LAB_ROLLBACK_DEPENDENCY_INVALID", "dependencies required");
    for (const ref of row.dependencyRefs) {
      const spec = rule.foreignKeys.find(key => key.dependencyRole === ref.role);
      if (!spec || roles.has(ref.role) || spec.targetTable !== ref.expectedTargetTable || MODEL.targetTables[ref.expectedTargetTable]?.phase !== ref.phase || PHASES.indexOf(ref.phase) > PHASES.indexOf(phase)) fail("LAB_ROLLBACK_DEPENDENCY_INVALID", "reference differs");
      roles.add(ref.role);
      if (ref.phase !== phase) continue;
      const parent = local.get(ref.sourceIdentitySha256)?.planned;
      if (!parent || parent.plannedTargetTable !== ref.expectedTargetTable || (row.disposition === "insert" && parent.disposition !== "insert")) fail("LAB_ROLLBACK_DEPENDENCY_INVALID", "local parent missing");
      children.get(ref.sourceIdentitySha256).add(row.sourceIdentitySha256);
    }
    if (row.disposition === "insert" && rule.foreignKeys.some(key => key.required && !roles.has(key.dependencyRole))) fail("LAB_ROLLBACK_DEPENDENCY_INVALID", "required reference missing");
  }
  const emitted = new Set(), layers = [];
  while (emitted.size < requested.length) {
    const layer = requested.filter(entry => !emitted.has(entry.planned.sourceIdentitySha256) && [...children.get(entry.planned.sourceIdentitySha256)].every(id => emitted.has(id)));
    if (!layer.length) fail("LAB_ROLLBACK_DEPENDENCY_INVALID", "dependency cycle");
    for (const entry of layer) emitted.add(entry.planned.sourceIdentitySha256);
    layers.push(layer);
  }
  return layers;
}

async function rollbackLabPhase(input, options) {
  exactKeys(input, ["tx", "phase", "records", "targetScope"], [], "lab reversal input");
  const { tx, phase, targetScope: scope } = input;
  if (!tx || typeof tx.query !== "function" || !isObject(scope) || !SHA256.test(scope.scopeSha256 ?? "") ||
      [scope.tenantId, scope.parkId].some(value => typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value))) fail("LAB_ROLLBACK_INPUT_INVALID", "scope and transaction required");
  const requested = validateRequestedRecords(phase, input.records);
  if (requested.some(({ planned }) => !["insert", "quarantine"].includes(planned.disposition))) fail("LAB_ROLLBACK_DISPOSITION_DENIED", "insert/quarantine only");
  const layers = labReverseLayers(requested, phase);
  const targets = rowsOf(await tx.query(
    `/* hr-lab-rollback:target */ SELECT current_database() AS database_name,
     EXISTS (SELECT 1 FROM sys_tenant WHERE btrim(tenant_id::text)=$1 AND status=1 AND is_deleted=false
       AND (expire_time IS NULL OR expire_time>clock_timestamp())) AS tenant_exists,
     EXISTS (SELECT 1 FROM biz_park WHERE btrim(tenant_id::text)=$1 AND btrim(park_id::text)=$2
       AND status=1 AND is_deleted=false) AS park_exists`, [scope.tenantId, scope.parkId],
  ), "lab target");
  if (targets.length !== 1 || targets[0].database_name !== options.expectedDatabase) fail("LAB_ROLLBACK_DATABASE_DENIED", "exact lab database required");
  if (!targets[0].tenant_exists || !targets[0].park_exists) fail("LAB_ROLLBACK_SCOPE_DENIED", "active owned scope required");
  const batches = rowsOf(await tx.query(
    `/* hr-lab-rollback:lock-batch */ SELECT id::text,run_id,source_system,source_snapshot_sha256,target_database,tool_version,execution_context,status
     FROM migration_batch WHERE run_id=$1 FOR UPDATE`, [`${options.runId}-${phase.toLowerCase()}`],
  ), "lab batch");
  const batch = batches[0];
  if (batches.length !== 1 || !UUID.test(batch?.id ?? "") || batch.execution_context !== "lab_rehearsal" || batch.target_database !== options.expectedDatabase ||
      batch.source_system !== MODEL.sourceSystem || batch.source_snapshot_sha256 !== options.sourceSnapshotHash || batch.tool_version !== options.toolVersion) fail("LAB_ROLLBACK_BATCH_MISMATCH", "exact batch binding required");
  if (batch.status === "rolled_back") fail("LAB_ROLLBACK_ALREADY_APPLIED", "batch already reversed");
  if (batch.status !== "succeeded") fail("LAB_ROLLBACK_BATCH_MISMATCH", "completed batch required");
  const later = rowsOf(await tx.query(
    `/* hr-lab-rollback:later-phases */ SELECT id::text,status FROM migration_batch WHERE run_id=ANY($1::text[]) FOR UPDATE`,
    [PHASES.slice(PHASES.indexOf(phase) + 1).map(name => `${options.runId}-${name.toLowerCase()}`)],
  ), "later lab phases");
  if (later.some(row => row.status !== "rolled_back")) fail("LAB_ROLLBACK_LATER_PHASE_ACTIVE", "reverse later phases first");
  const maps = rowsOf(await tx.query(
    `/* hr-lab-rollback:lock-maps */ SELECT id::text,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id::text,mapping_status,is_active
     FROM legacy_record_map WHERE batch_id=$1::uuid FOR UPDATE`, [batch.id],
  ), "lab maps");
  const bySource = new Map(maps.map(map => [map.source_identity_sha256, map]));
  if (maps.length !== requested.length || bySource.size !== requested.length) fail("LAB_ROLLBACK_MAP_COVERAGE_MISMATCH", "full batch coverage required");
  const targetIds = new Set();
  for (const entry of requested) {
    const row = entry.planned, map = bySource.get(row.sourceIdentitySha256), rule = MODEL.targetTables[row.plannedTargetTable];
    if (!map || !UUID.test(map.id ?? "") || map.is_active !== true || map.mapping_status !== (row.disposition === "insert" ? "loaded" : "quarantined") ||
        map.source_system !== MODEL.sourceSystem || row.sourceSystem !== MODEL.sourceSystem || map.source_table !== row.sourceTable || !rule.allowedSourceTables.includes(row.sourceTable) ||
        map.source_pk_canonical !== row.sourcePkCanonical || row.sourcePkCanonical !== `sha256:${row.sourceIdentitySha256}` || !SHA256.test(row.sourceRowSha256 ?? "") ||
        map.source_row_sha256 !== row.sourceRowSha256 || map.target_table !== row.plannedTargetTable || map.target_id !== (row.disposition === "insert" ? row.targetId : null)) fail("LAB_ROLLBACK_MAP_COVERAGE_MISMATCH", "map provenance differs");
    if (row.disposition === "insert" && (!UUID.test(row.targetId ?? "") || row.targetTable !== row.plannedTargetTable || !SHA256.test(row.expectedTargetAfterSha256 ?? "") || row.targetVersionAfter !== 1 || targetIds.has(row.targetId))) fail("LAB_ROLLBACK_MAP_COVERAGE_MISMATCH", "target differs");
    if (row.disposition === "insert") targetIds.add(row.targetId);
    Object.assign(entry, { rule, targetScope: scope, control: { target_id: map.target_id, target_table: map.target_table,
      target_after_sha256: row.expectedTargetAfterSha256, target_version_after: row.targetVersionAfter, disposition: row.disposition } });
  }
  // Validate and lock the complete business set before the first deletion.
  for (const table of new Set(requested.map(entry => entry.planned.plannedTargetTable))) {
    const entries = requested.filter(entry => entry.planned.plannedTargetTable === table && entry.planned.disposition === "insert");
    for (const part of chunks(entries, options.batchSize)) await lockAndVerifyBusinessRows(tx, table, MODEL.targetTables[table], part, scope, "insert");
  }
  for (const layer of layers) for (const table of new Set(layer.map(entry => entry.planned.plannedTargetTable))) {
    await deleteInsertedRows(tx, table, MODEL.targetTables[table], layer.filter(entry => entry.planned.plannedTargetTable === table && entry.planned.disposition === "insert"), scope, options.batchSize);
  }
  const inactive = rowsOf(await tx.query(
    `/* hr-lab-rollback:deactivate-maps */ UPDATE legacy_record_map SET is_active=false,mapping_status='rolled_back',update_time=now()
     WHERE batch_id=$1::uuid AND is_active AND mapping_status IN ('loaded','quarantined') RETURNING id::text`, [batch.id],
  ), "lab map reversal");
  if (inactive.length !== maps.length) fail("LAB_ROLLBACK_MAP_COVERAGE_MISMATCH", "map update count differs");
  // Item status has no reversed value. Preserve load items and append successful
  // reversal items using the existing phase/status contract.
  await tx.query(
    `/* hr-lab-rollback:items */ INSERT INTO migration_batch_item(batch_id,domain,source_object,phase,status,extracted_count,valid_count,loaded_count,rejected_count,started_at,finished_at)
     SELECT batch_id,domain,source_object,'rollback','succeeded',extracted_count,valid_count,loaded_count,rejected_count,now(),now()
     FROM migration_batch_item WHERE batch_id=$1::uuid AND phase='load' AND status='succeeded'`, [batch.id],
  );
  const finished = rowsOf(await tx.query(
    `/* hr-lab-rollback:finish */ UPDATE migration_batch SET status='rolled_back',update_time=now()
     WHERE id=$1::uuid AND status='succeeded' RETURNING id::text`, [batch.id],
  ), "lab batch reversal");
  if (finished.length !== 1) fail("LAB_ROLLBACK_BATCH_MISMATCH", "batch update count differs");
  return { phase, productionImport: "HOLD", status: "rolled_back", sourceCount: requested.length,
    deletedInsertCount: requested.filter(entry => entry.planned.disposition === "insert").length,
    quarantineNoopCount: requested.filter(entry => entry.planned.disposition === "quarantine").length, inactiveMapCount: inactive.length };
}

/** Lab ledger reversal. The caller owns the serializable transaction. */
export function createLabImportPhaseRollback(options) {
  exactKeys(options, ["expectedDatabase", "codeSha", "sourceSnapshotHash", "runId"], ["batchSize"], "lab reversal options");
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!/^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u.test(options.expectedDatabase ?? "") || options.expectedDatabase.length > 63 ||
      !/^[0-9a-f]{40}$/u.test(options.codeSha ?? "") || !SHA256.test(options.sourceSnapshotHash ?? "") || !/^[A-Za-z0-9][A-Za-z0-9._-]{5,59}$/u.test(options.runId ?? "")) fail("LAB_ROLLBACK_BINDING_INVALID", "lab binding required");
  if (!Number.isSafeInteger(batchSize) || batchSize < MIN_BATCH_SIZE || batchSize > MAX_BATCH_SIZE) fail("PRODUCTION_IMPORT_PHASE_ROLLBACK_BATCH_SIZE_INVALID", "invalid batch size");
  const config = Object.freeze({ ...options, batchSize, toolVersion: `lab-import-v1@${options.codeSha}` });
  return input => rollbackLabPhase(input, config);
}
