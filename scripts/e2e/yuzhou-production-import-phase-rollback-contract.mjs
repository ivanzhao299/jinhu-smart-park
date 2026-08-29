import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PRODUCTION_IMPORT_PHASE_ROLLBACK_BATCH_LIMITS,
  PRODUCTION_IMPORT_PHASE_ROLLBACK_TABLES,
  createProductionImportPhaseRollback,
} from "../hr-cutover/production-import-phase-rollback.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportTargetCanonicalHash,
} from "../hr-cutover/production-import-target-model.mjs";

const OPERATION = "yzprod-import-20260829T000000Z-abcdef123456";
const UUID = index => `00000000-0000-5000-8000-${String(index).padStart(12, "0")}`;
const H = value => Buffer.from(String(value)).toString("hex").repeat(64).slice(0, 64);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const targetScope = { tenantId: UUID(9001), parkId: UUID(9002), scopeSha256: H("scope") };
const model = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL;

function orgPayload(index, name = `Org ${index}`) {
  return { org_code: `ORG-${index}`, org_name: name, org_type: "department", sort_order: index, status: "enabled", remark: null };
}

function plannedRecord(index, disposition = "skip_approved", overrides = {}) {
  const payload = overrides.payload ?? orgPayload(index);
  const derivedFields = overrides.derivedFields ?? { parent_id: null };
  const canonical = computeProductionImportTargetCanonicalHash("sys_org", targetScope, payload, derivedFields);
  const sourceIdentitySha256 = overrides.sourceIdentitySha256 ?? H(`source-${index}`);
  const beforeVersion = overrides.expectedTargetVersionBefore ?? 4;
  return {
    sourceIdentitySha256,
    plannedTargetTable: "sys_org",
    disposition,
    ...(disposition === "quarantine" ? {} : {
      targetId: overrides.targetId ?? UUID(index),
      expectedTargetAfterSha256: overrides.expectedTargetAfterSha256 ?? canonical,
      targetVersionAfter: overrides.targetVersionAfter ?? (disposition === "insert" ? 1 : disposition === "merge" ? beforeVersion + 1 : beforeVersion),
    }),
    ...(["merge", "skip_approved"].includes(disposition) ? {
      expectedTargetBeforeSha256: overrides.expectedTargetBeforeSha256 ?? canonical,
      expectedTargetVersionBefore: beforeVersion,
    } : {}),
  };
}

function controlFor(planned, inputOrdinal, overrides = {}) {
  const hasTarget = planned.disposition !== "quarantine";
  const merge = planned.disposition === "merge";
  const ciphertext = merge ? Buffer.from(`cipher-${inputOrdinal}`) : null;
  return {
    input_ordinal: inputOrdinal,
    source_identity_sha256: planned.sourceIdentitySha256,
    disposition: planned.disposition,
    planned_target_table: planned.plannedTargetTable,
    target_table: hasTarget ? planned.plannedTargetTable : null,
    target_id: hasTarget ? planned.targetId : null,
    expected_target_before_sha256: planned.expectedTargetBeforeSha256 ?? null,
    target_after_sha256: planned.expectedTargetAfterSha256 ?? null,
    expected_target_version_before: planned.expectedTargetVersionBefore ?? null,
    target_version_after: planned.targetVersionAfter ?? null,
    rollback_status: "not_started",
    target_tenant_id: targetScope.tenantId,
    target_park_id: targetScope.parkId,
    target_scope_sha256: targetScope.scopeSha256,
    plaintext_sha256: merge ? planned.expectedTargetBeforeSha256 : null,
    ciphertext_sha256: merge ? sha256(ciphertext) : null,
    key_reference_sha256: merge ? H("key") : null,
    nonce: merge ? Buffer.alloc(12, 1) : null,
    authentication_tag: merge ? Buffer.alloc(16, 2) : null,
    ciphertext,
    algorithm: merge ? "aes-256-gcm-external-kek-v1" : null,
    legacy_record_map_id: UUID(100000 + inputOrdinal),
    migration_batch_id: UUID(200000 + inputOrdinal),
    map_target_table: planned.plannedTargetTable,
    map_target_id: hasTarget ? planned.targetId : null,
    mapping_status: planned.disposition === "quarantine" ? "quarantined" : "loaded",
    is_active: true,
    production_import_operation_id: OPERATION,
    production_import_phase: "T0",
    ...overrides,
  };
}

function fakeTx(handler) {
  const calls = [];
  return {
    calls,
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return handler(sql, parameters, calls);
    },
  };
}

function rollbackInput(records, tx) {
  return { tx, operationId: OPERATION, phase: "T0", records };
}

const noDecrypt = { decryptBeforeImage: async () => { throw new Error("unexpected decrypt"); } };

test("freezes the exact 16-table allowlist, 500-2000 batch policy, and has no connection/env/credential path", () => {
  assert.deepEqual([...PRODUCTION_IMPORT_PHASE_ROLLBACK_TABLES].sort(), Object.keys(model.targetTables).sort());
  assert.equal(PRODUCTION_IMPORT_PHASE_ROLLBACK_TABLES.length, 16);
  assert.deepEqual(PRODUCTION_IMPORT_PHASE_ROLLBACK_BATCH_LIMITS, { minimum: 500, maximum: 2000, default: 1000 });
  assert.throws(() => createProductionImportPhaseRollback({ cryptoProvider: noDecrypt, batchSize: 499 }), error => error.code === "PRODUCTION_IMPORT_PHASE_ROLLBACK_BATCH_SIZE_INVALID");
  assert.throws(() => createProductionImportPhaseRollback({ cryptoProvider: noDecrypt, batchSize: 2001 }), error => error.code === "PRODUCTION_IMPORT_PHASE_ROLLBACK_BATCH_SIZE_INVALID");
  assert.throws(() => createProductionImportPhaseRollback({ cryptoProvider: noDecrypt, databaseUrl: "forbidden" }), error => error.code === "PRODUCTION_IMPORT_PHASE_ROLLBACK_INPUT_INVALID");
  const source = readFileSync(fileURLToPath(new URL("../hr-cutover/production-import-phase-rollback.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /process\.env|connectionString|DATABASE_URL|PGPASSWORD|postgres:\/\/|createConnection|new Pool/iu);
});

test("all dispositions deactivate only their operation-owned projection maps in parameterized 1000-row batches", async () => {
  const records = Array.from({ length: 1003 }, (_, index) => plannedRecord(index + 1, index % 2 === 0 ? "skip_approved" : "quarantine"));
  const controls = records.map(controlFor);
  const tx = fakeTx(async (sql, parameters) => {
    if (sql.includes("lock-control")) return { rows: controls };
    if (sql.includes("dependency-order")) return { rows: [] };
    if (sql.includes("bulk-deactivate-projection-maps")) return { rows: JSON.parse(parameters[2]).map(row => ({ id: row.legacy_record_map_id })) };
    return { rows: [] };
  });
  const results = await createProductionImportPhaseRollback({ cryptoProvider: noDecrypt })(rollbackInput(records, tx));
  assert.equal(results.length, 1003);
  assert.equal(results[0].rollbackStatus, "skip_noop");
  assert.equal(results[1].rollbackStatus, "quarantine_noop");
  const updates = tx.calls.filter(call => call.sql.includes("bulk-deactivate-projection-maps"));
  assert.equal(updates.length, 2);
  assert.deepEqual(updates.map(call => JSON.parse(call.parameters[2]).length), [1000, 3]);
  assert(updates.every(call => call.sql.includes("receipt.operation_id=$1") && call.sql.includes("batch.production_import_operation_id=$1") && call.sql.includes("receipt.legacy_record_map_id=src.legacy_record_map_id")));
  assert(updates.every(call => !call.sql.includes(records[0].sourceIdentitySha256)));
});

test("insert rollback locks and verifies target ID/version/canonical CAS before physical bulk delete", async () => {
  const payload = orgPayload(10);
  const record = plannedRecord(10, "insert", { payload });
  const control = controlFor(record, 0);
  const tx = fakeTx(async (sql, parameters) => {
    if (sql.includes("lock-control")) return { rows: [control] };
    if (sql.includes("dependency-order")) return { rows: [] };
    if (sql.includes("lock-business:sys_org")) return { rows: [{ id: record.targetId, version: 1, ...payload, parent_id: null }] };
    if (sql.includes("bulk-delete-insert:sys_org")) return { rows: [{ id: record.targetId }] };
    if (sql.includes("bulk-deactivate-projection-maps")) return { rows: [{ id: control.legacy_record_map_id }] };
    return { rows: [] };
  });
  const result = await createProductionImportPhaseRollback({ cryptoProvider: noDecrypt })(rollbackInput([record], tx));
  assert.deepEqual(result, [{ sourceIdentitySha256: record.sourceIdentitySha256, rollbackStatus: "deleted_insert" }]);
  const deletion = tx.calls.find(call => call.sql.includes("bulk-delete-insert:sys_org"));
  assert.match(deletion.sql, /jsonb_to_recordset\(\$3::jsonb\)/u);
  assert.deepEqual(JSON.parse(deletion.parameters[2]), [{ id: record.targetId, expected_version: 1 }]);
});

test("insert target drift rejects before delete and map deactivation", async () => {
  const record = plannedRecord(11, "insert");
  const control = controlFor(record, 0);
  const tx = fakeTx(async sql => {
    if (sql.includes("lock-control")) return { rows: [control] };
    if (sql.includes("dependency-order")) return { rows: [] };
    if (sql.includes("lock-business:sys_org")) return { rows: [{ id: record.targetId, version: 1, ...orgPayload(11, "drifted"), parent_id: null }] };
    return { rows: [] };
  });
  await assert.rejects(createProductionImportPhaseRollback({ cryptoProvider: noDecrypt })(rollbackInput([record], tx)), error => error.code === "PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED");
  assert.equal(tx.calls.some(call => call.sql.includes("bulk-delete-insert")), false);
  assert.equal(tx.calls.some(call => call.sql.includes("bulk-deactivate-projection-maps")), false);
});

test("merge rollback decrypts the control-table before image, verifies plaintext canonical hash, and restores fields/version in bulk", async () => {
  const beforePayload = orgPayload(20, "Before");
  const afterPayload = orgPayload(20, "After");
  const beforeHash = computeProductionImportTargetCanonicalHash("sys_org", targetScope, beforePayload, { parent_id: null });
  const afterHash = computeProductionImportTargetCanonicalHash("sys_org", targetScope, afterPayload, { parent_id: null });
  const record = plannedRecord(20, "merge", { payload: afterPayload, expectedTargetBeforeSha256: beforeHash, expectedTargetAfterSha256: afterHash, expectedTargetVersionBefore: 7, targetVersionAfter: 8 });
  const control = controlFor(record, 0);
  const decryptCalls = [];
  const cryptoProvider = {
    async decryptBeforeImage(input) {
      decryptCalls.push(input);
      return { plaintextSha256: beforeHash, targetBefore: { payload: beforePayload, derivedFields: { parent_id: null }, version: 7, canonicalSha256: beforeHash } };
    },
  };
  const tx = fakeTx(async (sql, parameters) => {
    if (sql.includes("lock-control")) return { rows: [control] };
    if (sql.includes("dependency-order")) return { rows: [] };
    if (sql.includes("lock-business:sys_org")) return { rows: [{ id: record.targetId, version: 8, ...afterPayload, parent_id: null }] };
    if (sql.includes("bulk-restore-merge:sys_org")) return { rows: [{ id: record.targetId, version: 7 }] };
    if (sql.includes("bulk-deactivate-projection-maps")) return { rows: [{ id: control.legacy_record_map_id }] };
    return { rows: [] };
  });
  const result = await createProductionImportPhaseRollback({ cryptoProvider })(rollbackInput([record], tx));
  assert.deepEqual(result, [{ sourceIdentitySha256: record.sourceIdentitySha256, rollbackStatus: "restored_merge", observedCurrentSha256: afterHash, restoredSha256: beforeHash, casApplied: true }]);
  assert.equal(decryptCalls.length, 1);
  assert.deepEqual(decryptCalls[0].envelope.ciphertext, control.ciphertext);
  const restore = tx.calls.find(call => call.sql.includes("bulk-restore-merge:sys_org"));
  const restored = JSON.parse(restore.parameters[2])[0];
  assert.equal(restored.expected_version, 8);
  assert.equal(restored.restored_version, 7);
  assert.equal(restored.org_name, "Before");
});

test("merge rejects current version drift and decrypted plaintext drift before any restore or map mutation", async () => {
  const beforePayload = orgPayload(30, "Before");
  const afterPayload = orgPayload(30, "After");
  const beforeHash = computeProductionImportTargetCanonicalHash("sys_org", targetScope, beforePayload, { parent_id: null });
  const afterHash = computeProductionImportTargetCanonicalHash("sys_org", targetScope, afterPayload, { parent_id: null });
  const record = plannedRecord(30, "merge", { payload: afterPayload, expectedTargetBeforeSha256: beforeHash, expectedTargetAfterSha256: afterHash, expectedTargetVersionBefore: 2, targetVersionAfter: 3 });
  const control = controlFor(record, 0);
  for (const scenario of [
    { version: 2, decryptedHash: beforeHash, code: "PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED" },
    { version: 3, decryptedHash: H("wrong"), code: "PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID" },
  ]) {
    const cryptoProvider = { decryptBeforeImage: async () => ({ plaintextSha256: scenario.decryptedHash, targetBefore: { payload: beforePayload, derivedFields: { parent_id: null }, version: 2, canonicalSha256: beforeHash } }) };
    const tx = fakeTx(async sql => {
      if (sql.includes("lock-control")) return { rows: [control] };
      if (sql.includes("dependency-order")) return { rows: [] };
      if (sql.includes("lock-business:sys_org")) return { rows: [{ id: record.targetId, version: scenario.version, ...afterPayload, parent_id: null }] };
      return { rows: [] };
    });
    await assert.rejects(createProductionImportPhaseRollback({ cryptoProvider })(rollbackInput([record], tx)), error => error.code === scenario.code);
    assert.equal(tx.calls.some(call => call.sql.includes("bulk-restore-merge")), false);
    assert.equal(tx.calls.some(call => call.sql.includes("bulk-deactivate-projection-maps")), false);
  }
});

test("duplicate source identities and non-reversed same-phase dependencies fail closed before business writes", async () => {
  const parent = plannedRecord(40);
  const child = plannedRecord(41);
  const duplicateTx = fakeTx(async () => ({ rows: [] }));
  await assert.rejects(createProductionImportPhaseRollback({ cryptoProvider: noDecrypt })(rollbackInput([parent, parent], duplicateTx)), error => error.code === "PRODUCTION_IMPORT_SOURCE_DUPLICATE");
  assert.equal(duplicateTx.calls.length, 0);

  const controls = [controlFor(parent, 0), controlFor(child, 1)];
  const wrongOrderTx = fakeTx(async sql => {
    if (sql.includes("lock-control")) return { rows: controls };
    if (sql.includes("dependency-order")) return { rows: [{ source_identity_sha256: child.sourceIdentitySha256, depends_on_phase: "T0", depends_on_source_identity_sha256: parent.sourceIdentitySha256 }] };
    return { rows: [] };
  });
  await assert.rejects(createProductionImportPhaseRollback({ cryptoProvider: noDecrypt })(rollbackInput([parent, child], wrongOrderTx)), error => error.code === "PRODUCTION_IMPORT_PHASE_ROLLBACK_ORDER_INVALID");
  assert.equal(wrongOrderTx.calls.some(call => call.sql.includes("bulk-deactivate-projection-maps")), false);

  const reversedControls = [controlFor(child, 0), controlFor(parent, 1)];
  const correctOrderTx = fakeTx(async (sql, parameters) => {
    if (sql.includes("lock-control")) return { rows: reversedControls };
    if (sql.includes("dependency-order")) return { rows: [{ source_identity_sha256: child.sourceIdentitySha256, depends_on_phase: "T0", depends_on_source_identity_sha256: parent.sourceIdentitySha256 }] };
    if (sql.includes("bulk-deactivate-projection-maps")) return { rows: JSON.parse(parameters[2]).map(row => ({ id: row.legacy_record_map_id })) };
    return { rows: [] };
  });
  const results = await createProductionImportPhaseRollback({ cryptoProvider: noDecrypt })(rollbackInput([child, parent], correctOrderTx));
  assert.deepEqual(results.map(result => result.sourceIdentitySha256), [child.sourceIdentitySha256, parent.sourceIdentitySha256]);
});
