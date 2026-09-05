import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { computeProductionImportPayloadHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import {
  PRODUCTION_IMPORT_PHASE_WRITER_BATCH_LIMITS,
  PRODUCTION_IMPORT_PHASE_WRITER_TABLES,
  createProductionImportPhaseWriters,
} from "../hr-cutover/production-import-phase-writers.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash,
  deriveProductionImportTargetId,
} from "../hr-cutover/production-import-target-model.mjs";

const H = value => createHash("sha256").update(String(value)).digest("hex");
const BATCH_ID = "00000000-0000-5000-8000-000000000001";
const targetScope = { tenantId: "00000000-0000-5000-8000-000000000010", parkId: "00000000-0000-5000-8000-000000000020", scopeSha256: H("scope") };
const operationId = "yzprod-import-20260829T000000Z-aaaaaaaaaaaa";
const cipher = Buffer.from("sealed-before-image");
const quarantineCipher = Buffer.from("sealed-quarantine");
const cryptoProvider = {
  async encryptBeforeImage() { return { ciphertext: cipher, nonce: Buffer.alloc(12, 1), authenticationTag: Buffer.alloc(16, 2) }; },
  async encryptQuarantine() { return { ciphertext: quarantineCipher, nonce: Buffer.alloc(12, 3), authenticationTag: Buffer.alloc(16, 4) }; },
};

function uuid(index) {
  return `00000000-0000-5000-8000-${String(index).padStart(12, "0")}`;
}

function orgPayload(index, name = `Org ${index}`) {
  return { org_code: `ORG-${index}`, org_name: name, org_type: "department", sort_order: index, status: "enabled", remark: null };
}

function orgRecord(index, disposition = "insert", payload = orgPayload(index), extras = {}) {
  const sourceIdentitySha256 = H(`source-${index}`);
  const targetId = deriveProductionImportTargetId({ targetScope, targetTable: "sys_org", sourceIdentitySha256 });
  const after = computeProductionImportTargetCanonicalHash("sys_org", targetScope, payload, { parent_id: null });
  const businessIdentitySha256 = computeProductionImportBusinessIdentityHash("sys_org", targetScope, payload, { parent_id: null });
  const base = {
    sourceSystem: "yuzhou-v10",
    sourceTable: "dbo.departmentcode",
    sourcePkCanonical: `sha256:${sourceIdentitySha256}`,
    sourceIdentitySha256,
    sourceRowSha256: H(`row-${index}`),
    payloadSha256: computeProductionImportPayloadHash(payload),
    plannedTargetTable: "sys_org",
    dependencyMode: "record_graph",
    dependencyRefs: [],
    disposition,
  };
  if (disposition === "quarantine") return {
    ...base,
    decisionAttestationSha256: H(`attestation-${index}`),
    quarantine: { reasonCode: "LEGACY_VALUE_REVIEW", algorithm: "aes-256-gcm-external-kek-v1", payloadCiphertextSha256: H(quarantineCipher), keyReferenceSha256: H("key") },
    ...extras,
  };
  return {
    ...base,
    targetTable: "sys_org",
    targetId,
    businessIdentitySha256,
    expectedTargetAfterSha256: after,
    targetVersionAfter: 1,
    ...extras,
  };
}

function phaseInput(records, payloads, phaseName = "T0") {
  return {
    operationId,
    targetScope,
    phase: {
      phase: phaseName,
      ordinal: Number(phaseName.slice(1)),
      sourceBatchManifestSha256: H("manifest"),
      payloadBundleArtifactSha256: H("artifact"),
      payloadBundleSha256: H("bundle"),
      canonicalizationVersion: "yuzhou-production-import-canonical-json-v1",
      beforeCanonicalSha256: H("before"),
      expectedAfterCanonicalSha256: H("after"),
      records,
    },
    payloadBundle: {
      phase: phaseName,
      records: records.map((record, index) => ({
        sourceIdentitySha256: record.sourceIdentitySha256,
        sourceRowSha256: record.sourceRowSha256,
        targetTable: record.plannedTargetTable,
        payloadSha256: record.payloadSha256,
        payload: payloads[index],
      })),
    },
  };
}

function fakeTx(handler = async () => ({ rows: [] })) {
  const calls = [];
  return {
    calls,
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.includes("hr-prod-phase:set-current")) return { rows: [{ operation_id: operationId }] };
      if (sql.includes("hr-prod-phase:create-batch")) return { rows: [{ id: BATCH_ID }] };
      if (sql.includes("hr-prod-phase:bulk-insert:")) return { rows: JSON.parse(parameters[0]).map(row => ({ id: row.id, version: 1 })) };
      if (sql.includes("hr-prod-phase:bulk-merge:")) return { rows: JSON.parse(parameters[0]).map(row => ({ id: row.id, version: row.expected_version + 1 })) };
      if (sql.includes("hr-prod-phase:bulk-map-receipt")) return { rows: JSON.parse(parameters[3]).map(row => ({ source_identity_sha256: row.source_identity_sha256 })) };
      if (sql.includes("hr-prod-phase:bulk-quarantine-map-receipt")) return { rows: JSON.parse(parameters[3]).map(row => ({ source_identity_sha256: row.source_identity_sha256 })) };
      if (sql.includes("hr-prod-phase:bulk-batch-items")) return { rows: JSON.parse(parameters[1]).map((_, index) => ({ id: index + 1 })) };
      if (sql.includes("hr-prod-phase:finish-batch")) return { rows: [{ id: BATCH_ID }] };
      return handler(sql, parameters, calls);
    },
  };
}

test("exports fixed writers for all 16 allowlisted target tables and no connection or key-loading path", () => {
  const writers = createProductionImportPhaseWriters({ cryptoProvider });
  assert.deepEqual(Object.keys(writers), ["T0", "T1", "T2", "T3"]);
  assert.deepEqual(PRODUCTION_IMPORT_PHASE_WRITER_TABLES, Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables));
  assert.equal(PRODUCTION_IMPORT_PHASE_WRITER_TABLES.length, 16);
  assert.deepEqual(PRODUCTION_IMPORT_PHASE_WRITER_BATCH_LIMITS, { minimum: 500, maximum: 2000, default: 1000 });
  const source = readFileSync(fileURLToPath(new URL("../hr-cutover/production-import-phase-writers.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /process\.env|DATABASE_URL|PGPASSWORD|connectionString|postgres:\/\/|BEGIN|COMMIT|ROLLBACK/iu);
  assert.match(source, /jsonb_to_recordset/);
  assert.doesNotMatch(source, /for \([^)]*\)\s*await tx\.query/gu);
});

test("uses 500-2000 row parameterized JSON batches instead of one query per record", async () => {
  const payloads = Array.from({ length: 1001 }, (_, index) => orgPayload(index + 1));
  const records = payloads.map((payload, index) => orgRecord(index + 1, "insert", payload));
  const tx = fakeTx();
  const input = phaseInput(records, payloads);
  input.tx = tx;
  const result = await createProductionImportPhaseWriters({ cryptoProvider })["T0"](input);
  assert.equal(result.records.length, 1001);
  assert.equal(tx.calls.filter(call => call.sql.includes("hr-prod-phase:bulk-insert:sys_org")).length, 2);
  assert.equal(tx.calls.filter(call => call.sql.includes("hr-prod-phase:bulk-map-receipt")).length, 2);
  assert(tx.calls.every(call => Array.isArray(call.parameters)));
  assert(tx.calls.length < 15);
});

test("rejects unsafe batch sizes, unknown options, unknown tables and unknown payload columns before SQL", async () => {
  for (const batchSize of [499, 2001, 1.5]) assert.throws(() => createProductionImportPhaseWriters({ cryptoProvider, batchSize }), error => error.code === "PRODUCTION_IMPORT_PHASE_WRITER_BATCH_SIZE_INVALID");
  assert.throws(() => createProductionImportPhaseWriters({ cryptoProvider, databaseUrl: "forbidden" }), error => error.code === "PRODUCTION_IMPORT_PHASE_WRITER_INPUT_INVALID");
  const payload = orgPayload(1);
  const unknownTable = orgRecord(1);
  unknownTable.plannedTargetTable = "sys_user";
  unknownTable.targetTable = "sys_user";
  const tx1 = fakeTx();
  const input1 = phaseInput([unknownTable], [payload]);
  input1.tx = tx1;
  await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider })["T0"](input1), error => error.code === "PRODUCTION_IMPORT_TARGET_TABLE_DENIED");
  assert.equal(tx1.calls.length, 0);
  const extra = { ...payload, injected_column: "no" };
  const record = orgRecord(2, "insert", extra);
  const tx2 = fakeTx();
  const input2 = phaseInput([record], [extra]);
  input2.tx = tx2;
  await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider })["T0"](input2), error => error.code === "PRODUCTION_IMPORT_TARGET_FIELD_DENIED");
  assert.equal(tx2.calls.length, 0);
});

test("recomputes generated business identity, canonical result, and deterministic insert ID before business writes", async () => {
  const payload = orgPayload(3);
  for (const [mutation, code] of [
    [record => { record.businessIdentitySha256 = H("wrong-business-identity"); }, "PRODUCTION_IMPORT_BUSINESS_IDENTITY_MISMATCH"],
    [record => { record.expectedTargetAfterSha256 = H("wrong-after-canonical"); }, "PRODUCTION_IMPORT_TARGET_CANONICAL_MISMATCH"],
    [record => { record.targetId = uuid(999); }, "PRODUCTION_IMPORT_TARGET_IDENTITY_MISMATCH"],
  ]) {
    const record = orgRecord(3, "insert", payload);
    mutation(record);
    const tx = fakeTx();
    const input = phaseInput([record], [payload]);
    input.tx = tx;
    await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider }).T0(input), error => error.code === code);
    assert.equal(tx.calls.some(call => call.sql.includes("bulk-insert:sys_org")), false);
  }
});

test("merge and skip lock in bulk and enforce both canonical hash and version CAS", async () => {
  const beforePayload = orgPayload(10, "Before");
  const afterPayload = orgPayload(10, "After");
  const beforeHash = computeProductionImportTargetCanonicalHash("sys_org", targetScope, beforePayload, { parent_id: null });
  const merge = orgRecord(10, "merge", afterPayload, {
    expectedTargetBeforeSha256: beforeHash,
    expectedTargetVersionBefore: 7,
    targetVersionAfter: 8,
    decisionAttestationSha256: H("merge-decision"),
    beforeImage: { algorithm: "aes-256-gcm-external-kek-v1", plaintextSha256: beforeHash, ciphertextSha256: H(cipher), keyReferenceSha256: H("key") },
  });
  const tx = fakeTx(async sql => {
    if (sql.includes("hr-prod-phase:lock-existing")) return { rows: [{ id: merge.targetId, version: 7, ...beforePayload, parent_id: null }] };
    return { rows: [] };
  });
  const input = phaseInput([merge], [afterPayload]);
  input.tx = tx;
  const result = await createProductionImportPhaseWriters({ cryptoProvider })["T0"](input);
  assert.equal(result.records[0].targetVersionAfter, 8);
  assert.deepEqual(result.records[0].beforeImage, { ciphertext: cipher, nonce: Buffer.alloc(12, 1), authenticationTag: Buffer.alloc(16, 2) });

  for (const drift of [
    { version: 6, payload: beforePayload, code: "PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED" },
    { version: 7, payload: orgPayload(10, "Drift"), code: "PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED" },
  ]) {
    const drifting = fakeTx(async sql => sql.includes("hr-prod-phase:lock-existing") ? { rows: [{ id: merge.targetId, version: drift.version, ...drift.payload, parent_id: null }] } : { rows: [] });
    const attempt = phaseInput([merge], [afterPayload]);
    attempt.tx = drifting;
    await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider })["T0"](attempt), error => error.code === drift.code);
    assert.equal(drifting.calls.some(call => call.sql.includes("bulk-merge")), false);
  }
});

test("dependencies resolve only through exact active maps from this operation and missing dependencies fail before business writes", async () => {
  const payload = { position_code: "P-1", position_name: "Position", job_family: null, job_level: null, headcount_limit: null, status: "enabled", remark: null };
  const sourceIdentitySha256 = H("position");
  const ownerIdentity = H("org-owner");
  const record = {
    sourceSystem: "yuzhou-v10", sourceTable: "dbo.job", sourcePkCanonical: `sha256:${sourceIdentitySha256}`,
    sourceIdentitySha256, sourceRowSha256: H("position-row"), payloadSha256: computeProductionImportPayloadHash(payload),
    plannedTargetTable: "hr_position", dependencyMode: "record_graph",
    dependencyRefs: [{ role: "org", phase: "T0", sourceIdentitySha256: ownerIdentity, expectedTargetTable: "sys_org" }],
    disposition: "insert", targetTable: "hr_position", targetId: uuid(600),
    businessIdentitySha256: computeProductionImportBusinessIdentityHash("hr_position", targetScope, payload, { org_id: uuid(601) }),
    expectedTargetAfterSha256: computeProductionImportTargetCanonicalHash("hr_position", targetScope, payload, { org_id: uuid(601) }), targetVersionAfter: 1,
  };
  const tx = fakeTx(async sql => sql.includes("hr-prod-phase:resolve-dependencies") ? { rows: [] } : { rows: [] });
  const input = phaseInput([record], [payload]);
  input.tx = tx;
  await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider })["T0"](input), error => error.code === "PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED");
  assert.equal(tx.calls.some(call => call.sql.includes("bulk-insert:hr_position")), false);
});

test("T1 exact target readback preserves wall-clock microseconds and rejects lossy Date values", async () => {
  const table = "hr_employment_event", identity = H("synthetic event"), owner = H("synthetic employee"), employeeId = uuid(701);
  const payload = { event_no: "SYN-701", event_type: "transfer", effective_date: "2026-01-01", before_snapshot: {}, after_snapshot: {}, reason: null, status: "effective", legacy_event_no: "SYN-701", legacy_event_type: "synthetic", legacy_state: "1", source_effective_at: "2026-01-01T08:30:00.123456+08:00", migration_decision: "accepted", is_historical_import: true, remark: null };
  const canonicalHash = computeProductionImportTargetCanonicalHash(table, targetScope, payload, { employee_id: employeeId });
  const record = { sourceSystem: "yuzhou-v10", sourceTable: "dbo.readjust", sourcePkCanonical: `sha256:${identity}`, sourceIdentitySha256: identity, sourceRowSha256: H("event row"), payloadSha256: computeProductionImportPayloadHash(payload), plannedTargetTable: table, targetTable: table, targetId: uuid(702), dependencyMode: "record_graph", dependencyRefs: [{ role: "employee", phase: "T0", sourceIdentitySha256: owner, expectedTargetTable: "hr_employee" }], disposition: "skip_approved", businessIdentitySha256: computeProductionImportBusinessIdentityHash(table, targetScope, payload, { employee_id: employeeId }), expectedTargetAfterSha256: canonicalHash, expectedTargetBeforeSha256: canonicalHash, expectedTargetVersionBefore: 3, targetVersionAfter: 3 };
  for (const observed of [payload.source_effective_at, new Date("2026-01-01T08:30:00.123Z"), "2026-01-01T08:30:00.123+08:00"]) {
    const tx = fakeTx(async sql => {
      if (sql.includes("hr-prod-phase:resolve-dependencies")) return { rows: [{ source_identity_sha256: owner, target_table: "hr_employee", target_id: employeeId, mapping_status: "loaded", phase: "T0" }] };
      if (sql.includes("hr-prod-phase:lock-existing")) {
        assert.match(sql, /to_char\(.*source_effective_at.*SS\.US/u);
        return { rows: [{ id: record.targetId, version: 3, ...payload, source_effective_at: observed, employee_id: employeeId }] };
      }
      return { rows: [] };
    });
    const input = { ...phaseInput([record], [payload], "T1"), tx };
    if (observed === payload.source_effective_at) assert.equal((await createProductionImportPhaseWriters({ cryptoProvider }).T1(input)).records.length, 1);
    else await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider }).T1(input), e => /^PRODUCTION_IMPORT_/u.test(e.code));
    assert.equal(tx.calls.some(call => /hr-prod-phase:bulk-(?:insert|merge):hr_employment_event/u.test(call.sql)), false);
  }
});

test("quarantine creates the compatible quarantined map and exact projection receipt required by 000282", async () => {
  const payload = { org_code: "BAD" };
  const record = orgRecord(50, "quarantine", payload);
  const tx = fakeTx();
  const input = phaseInput([record], [payload]);
  input.tx = tx;
  const result = await createProductionImportPhaseWriters({ cryptoProvider })["T0"](input);
  assert.equal(result.records[0].disposition, "quarantine");
  assert.equal(H(result.records[0].quarantineCiphertext), record.quarantine.payloadCiphertextSha256);
  assert.equal(tx.calls.filter(call => call.sql.includes("bulk-quarantine-map-receipt")).length, 1);
  assert.equal(tx.calls.filter(call => call.sql.includes("bulk-map-receipt")).length, 0);
  const migration = readFileSync(fileURLToPath(new URL("../../database/migrations/000282_hr_yuzhou_production_import_writer_receipts.sql", import.meta.url)), "utf8");
  assert.match(migration, /v_receipt_count<>1[\s\S]*PRODUCTION_IMPORT_PROJECTION_RECEIPT_REQUIRED/u);
  assert.match(migration, /disposition='quarantine'[\s\S]*mapping_status<>'quarantined'[\s\S]*PRODUCTION_IMPORT_QUARANTINE_PROJECTION_INVALID/u);
});

test("orphan contract change writes only quarantine maps and encrypted receipts, never a business target", async () => {
  const payload = {};
  const record = orgRecord(51, "quarantine", payload, {
    sourceTable: "dbo.compact_c", plannedTargetTable: "hr_contract_change", dependencyRefs: [],
  });
  const tx = fakeTx();
  const result = await createProductionImportPhaseWriters({ cryptoProvider }).T2({ ...phaseInput([record], [payload], "T2"), tx });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].disposition, "quarantine");
  assert.equal(result.records[0].targetId, undefined);
  assert.equal(H(result.records[0].quarantineCiphertext), record.quarantine.payloadCiphertextSha256);
  assert.equal(tx.calls.some(call => /hr-prod-phase:(bulk-insert:|bulk-merge:|lock-existing)/u.test(call.sql)), false);
  const mapCalls = tx.calls.filter(call => call.sql.includes("bulk-quarantine-map-receipt"));
  assert.equal(mapCalls.length, 1);
  assert.match(mapCalls[0].sql, /target_table,NULL,'quarantined'/u);
  assert.equal(JSON.parse(mapCalls[0].parameters[3])[0].target_table, "hr_contract_change");
  assert.equal(tx.calls.some(call => call.sql.includes("hr-prod-phase:bulk-map-receipt")), false);

  for (const [dependency, code] of [
    [{ role: "contract", phase: "T2", sourceIdentitySha256: H("missing"), expectedTargetTable: "hr_contract" }, "PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED"],
    [{ role: "contract", phase: "T0", sourceIdentitySha256: H("missing"), expectedTargetTable: "hr_employee" }, "PRODUCTION_IMPORT_DEPENDENCY_INVALID"],
  ]) {
    const invalid = { ...record, dependencyRefs: [dependency] };
    const invalidTx = fakeTx();
    await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider }).T2({ ...phaseInput([invalid], [payload], "T2"), tx: invalidTx }), error => error.code === code);
    assert.equal(invalidTx.calls.some(call => call.sql.includes("bulk-quarantine-map-receipt")), false);
  }
});

test("all-empty dependency layer still rejects required references for active contract changes", async () => {
  const payload = Object.fromEntries(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables.hr_contract_change.fieldWhitelist.map(field => [field, null]));
  const record = orgRecord(52, "insert", orgPayload(52), {
    sourceTable: "dbo.compact_c", plannedTargetTable: "hr_contract_change", targetTable: "hr_contract_change",
    dependencyRefs: [], payloadSha256: computeProductionImportPayloadHash(payload),
  });
  const tx = fakeTx();
  await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider }).T2({ ...phaseInput([record], [payload], "T2"), tx }), error => error.code === "PRODUCTION_IMPORT_DEPENDENCY_REQUIRED");
  assert.equal(tx.calls.some(call => /hr-prod-phase:(bulk-insert:|bulk-merge:|bulk-map-receipt)/u.test(call.sql)), false);
});

test("duplicate source or target identities fail before SQL and a partial database failure bubbles to the outer SERIALIZABLE owner", async () => {
  const payload = orgPayload(70);
  const duplicateSource = [orgRecord(70), orgRecord(70)];
  const tx1 = fakeTx();
  const input1 = phaseInput(duplicateSource, [payload, payload]);
  input1.tx = tx1;
  await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider })["T0"](input1), error => error.code === "PRODUCTION_IMPORT_SOURCE_DUPLICATE");
  assert.equal(tx1.calls.length, 0);

  const first = orgRecord(71);
  const second = orgRecord(72, "insert", orgPayload(72), { targetId: first.targetId });
  const tx2 = fakeTx();
  const input2 = phaseInput([first, second], [orgPayload(71), orgPayload(72)]);
  input2.tx = tx2;
  await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider })["T0"](input2), error => error.code === "PRODUCTION_IMPORT_TARGET_MAP_DUPLICATE");
  assert.equal(tx2.calls.length, 0);

  const failure = new Error("bulk write failed");
  const tx3 = fakeTx();
  const originalQuery = tx3.query.bind(tx3);
  tx3.query = async (sql, parameters) => {
    if (sql.includes("bulk-insert:sys_org")) { tx3.calls.push({ sql, parameters }); throw failure; }
    return originalQuery(sql, parameters);
  };
  const input3 = phaseInput([orgRecord(73)], [orgPayload(73)]);
  input3.tx = tx3;
  await assert.rejects(createProductionImportPhaseWriters({ cryptoProvider })["T0"](input3), error => error === failure);
  assert.equal(tx3.calls.some(call => /\b(?:BEGIN|COMMIT|ROLLBACK)\b/u.test(call.sql)), false);
  assert.equal(tx3.calls.some(call => call.sql.includes("finish-batch")), false);
});
