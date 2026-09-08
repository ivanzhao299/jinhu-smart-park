import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createLabImportPhaseWriters } from "../hr-cutover/production-import-phase-writers.mjs";
import { computeProductionImportPayloadHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash, deriveProductionImportTargetId } from "../hr-cutover/production-import-target-model.mjs";

const h = value => createHash("sha256").update(value).digest("hex");
const scope = { tenantId: "fixture-tenant", parkId: "fixture-park", scopeSha256: h("scope") };
const ciphertext = Buffer.from("synthetic-encrypted-quarantine");
const cryptoCalls = [];
const config = { expectedDatabase: "jinhu_hr_migration_lab_fixture", runId: "fixture-run", codeSha: "a".repeat(40), sourceSnapshotHash: h("source"),
  cryptoProvider: { async encryptBeforeImage() { throw new Error("must not encrypt before image"); }, async encryptQuarantine(input) {
    cryptoCalls.push(input); return { ciphertext, nonce: Buffer.alloc(12), authenticationTag: Buffer.alloc(16) };
  } } };

function record(table, label, parents = {}, disposition = "insert") {
  const rule = model.targetTables[table];
  const payload = Object.fromEntries(rule.fieldWhitelist.map(field => [field, rule.nullableFields.includes(field) ? null
    : rule.integerFields.includes(field) ? 1 : rule.booleanFields.includes(field) ? true : rule.jsonObjectFields.includes(field) ? {}
      : rule.dateFields.includes(field) ? "2024-01-01" : rule.timestampFields.includes(field) ? "2024-01-01T00:00:00.000000+08:00" : `${label}-${field}`]));
  const derived = Object.fromEntries(rule.foreignKeys.map(ref => [ref.column, parents[ref.dependencyRole]?.record.targetId ?? null]));
  const sourceIdentitySha256 = h(label);
  const result = { phase: rule.phase, sourceSystem: model.sourceSystem, sourceTable: rule.allowedSourceTables[0],
    sourcePkCanonical: `sha256:${sourceIdentitySha256}`, sourceIdentitySha256, sourceRowSha256: h(`row-${label}`),
    payloadSha256: computeProductionImportPayloadHash(payload), plannedTargetTable: table, disposition,
    dependencyRefs: Object.entries(parents).map(([role, parent]) => ({ role, phase: parent.record.phase,
      sourceIdentitySha256: parent.record.sourceIdentitySha256, expectedTargetTable: parent.record.plannedTargetTable })) };
  if (disposition === "quarantine") result.quarantine = { payloadCiphertextSha256: h(ciphertext) };
  else Object.assign(result, { targetTable: table, targetId: deriveProductionImportTargetId({ targetScope: scope, targetTable: table, sourceIdentitySha256 }),
    targetVersionAfter: 1, businessIdentitySha256: computeProductionImportBusinessIdentityHash(table, scope, payload, derived),
    expectedTargetAfterSha256: computeProductionImportTargetCanonicalHash(table, scope, payload, derived) });
  return { record: result, payload };
}
function input(tx, phase, rows) {
  return { tx, operationId: "fixture-envelope-operation", targetScope: scope,
    phase: { phase, records: rows.map(row => row.record), payloadBundleArtifactSha256: h("artifact"), payloadBundleSha256: h("bundle"),
      canonicalizationVersion: model.canonicalizationVersion, expectedAfterCanonicalSha256: h("after") },
    payloadBundle: { phase, targetScope: scope, records: rows.map(({ record: row, payload }) => ({
      sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, payloadSha256: row.payloadSha256,
      targetTable: row.plannedTargetTable, payload })) } };
}
function fakeTx(options = {}) {
  const calls = [], batches = new Map(), maps = [], business = new Map();
  return { calls, maps, batches, business, async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("hr-lab-phase:target")) return { rows: [{ database_name: options.database ?? config.expectedDatabase, tenant_exists: true, park_exists: !options.wrongScope }] };
    if (sql.includes("hr-lab-phase:create-batch")) {
      const id = `00000000-0000-5000-8000-${String(batches.size + 1).padStart(12, "0")}`;
      batches.set(params[0], { id, runId: params[0], status: "running" }); return { rows: [{ id }] };
    }
    if (sql.includes("bulk-insert:")) {
      const rows = JSON.parse(params[0]);
      const table = sql.match(/bulk-insert:([a-z_]+)/u)[1];
      for (const row of rows) for (const field of model.targetTables[table].derivedFields) row[field] ??= null;
      for (const row of rows) row.version ??= 1;
      for (const row of rows) business.set(row.id, row);
      return { rows };
    }
    if (sql.includes("lock-existing")) return { rows: params[2].map(id => ({ ...business.get(id), ...(options.readbackDrift ? { version: 9 } : {}) })) };
    if (sql.includes("hr-lab-phase:insert-maps")) {
      const rows = JSON.parse(params[1]); maps.push(...rows.map(row => ({ ...row, batchId: params[0] }))); return { rows };
    }
    if (sql.includes("hr-lab-phase:resolve-dependencies")) {
      const requested = JSON.parse(params[0]);
      return { rows: options.missingParent ? [] : requested.flatMap(ref => maps.filter(map => map.batchId === batches.get(ref.run_id)?.id && params[7].includes(map.source_identity_sha256)).map(map => ({ ...map, phase: ref.phase }))) };
    }
    if (sql.includes("hr-lab-phase:parent-scope")) return { rows: options.wrongParentScope ? [] : params[2].filter(id => business.has(id)).map(id => ({ id })) };
    if (sql.includes("bulk-batch-items")) return { rows: JSON.parse(params[1]).map((_, id) => ({ id })) };
    if (sql.includes("finish-batch")) { const batch = [...batches.values()].find(row => row.id === params[0]); batch.status = "succeeded"; return { rows: [{ id: batch.id }] }; }
    throw new Error("unexpected SQL");
  } };
}
function family() {
  const org = record("sys_org", "org");
  const child = record("sys_org", "child", { parent_org: org });
  const employee = record("hr_employee", "employee", { primary_org: child });
  const event = record("hr_employment_event", "event", { employee });
  return { org, child, employee, event };
}

test("lab T0/T1 reuse business semantics, exact lab batch dependencies and encrypted quarantine bindings", async () => {
  const tx = fakeTx(), writers = createLabImportPhaseWriters(config), { org, child, employee, event } = family();
  const quarantined = record("hr_employee", "rejected", { primary_org: org }, "quarantine");
  const t0 = input(tx, "T0", [employee, child, quarantined, org]);
  const original = structuredClone({ phase: t0.phase, payloadBundle: t0.payloadBundle });
  const result = await writers.T0(t0);
  await writers.T1(input(tx, "T1", [event]));
  assert.deepEqual({ phase: t0.phase, payloadBundle: t0.payloadBundle }, original);
  assert.equal(result.batchId, tx.batches.get("fixture-run-t0").id);
  assert.equal(result.productionImport, "HOLD");
  assert.equal(result.payloadBundleSha256, t0.phase.payloadBundleSha256);
  assert.equal(result.afterCanonicalSha256, t0.phase.expectedAfterCanonicalSha256);
  assert.equal(result.records[0].targetAfterSha256, employee.record.expectedTargetAfterSha256);
  assert.equal(tx.maps.find(row => row.source_identity_sha256 === employee.record.sourceIdentitySha256).source_row_sha256, employee.record.sourceRowSha256);
  assert.equal(tx.maps.find(row => row.source_identity_sha256 === quarantined.record.sourceIdentitySha256).mapping_status, "quarantined");
  assert.equal(tx.maps.find(row => row.mapping_status === "quarantined").target_id, null);
  assert.equal(cryptoCalls.at(-1).operationId, t0.operationId);
  assert.deepEqual(cryptoCalls.at(-1).payload, quarantined.payload);
  assert.deepEqual(cryptoCalls.at(-1).targetScope, scope);
  assert.equal(result.records[2].quarantineCiphertext, ciphertext);
  const sql = tx.calls.map(call => call.sql).join("\n");
  assert.doesNotMatch(sql, /hr_yuzhou_production_import|projection_receipt|set-current|bulk-merge|BEGIN|COMMIT|ROLLBACK/);
  const lookup = tx.calls.find(call => call.sql.includes("resolve-dependencies") && call.params[5] === "T1");
  assert.deepEqual(JSON.parse(lookup.params[0]), [{ phase: "T0", run_id: "fixture-run-t0" }]);
  assert.equal(lookup.params[2], config.sourceSnapshotHash);
  assert.match(lookup.sql, /batch\.id=\$7::uuid/);
  assert.match(lookup.sql, /batch\.status='succeeded'/);
  assert.match(lookup.sql, /map\.is_active/);
  assert.match(lookup.sql, /map\.mapping_status IN \('loaded','quarantined'\)/);
  assert.equal(tx.business.size, 4);
});

for (const [label, options, expected] of [
  ["database mismatch", { database: "jinhu_smart_park" }, "LAB_IMPORT_DATABASE_DENIED"],
  ["inactive or foreign scope", { wrongScope: true }, "LAB_IMPORT_SCOPE_DENIED"],
  ["missing lab parent", { missingParent: true }, "PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED"],
  ["foreign parent scope", { wrongParentScope: true }, "PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED"],
  ["canonical readback version drift", { readbackDrift: true }, "PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED"],
]) test(`${label} fails closed`, async () => {
  const tx = fakeTx(options), { org, child } = family();
  await assert.rejects(createLabImportPhaseWriters(config).T0(input(tx, "T0", [child, org])), error => error.code === expected);
  if (options.database || options.wrongScope) assert.equal(tx.calls.length, 1);
});
test("bad bindings and noninsert dispositions denied without ledger writes", async () => {
  for (const change of [{ runId: "x".repeat(61) }, { expectedDatabase: "jinhu_hr_migration_lab" }, { codeSha: "bad" }]) {
    assert.throws(() => createLabImportPhaseWriters({ ...config, ...change }), error => error.code === "LAB_IMPORT_BINDING_INVALID");
  }
  for (const disposition of ["merge", "skip_approved"]) {
    const tx = fakeTx(), row = record("sys_org", "existing");
    Object.assign(row.record, { disposition, expectedTargetVersionBefore: disposition === "merge" ? 0 : 1, expectedTargetBeforeSha256: row.record.expectedTargetAfterSha256 });
    await assert.rejects(createLabImportPhaseWriters(config).T0(input(tx, "T0", [row])), error => error.code === "LAB_IMPORT_DISPOSITION_DENIED");
    assert.equal(tx.calls.length, 0);
  }
});
test("crypto errors bubble to transaction owner before batch success", async () => {
  const tx = fakeTx(), failure = new Error("synthetic crypto failure"), row = record("sys_org", "bad-crypto", {}, "quarantine");
  const writers = createLabImportPhaseWriters({ ...config, cryptoProvider: { ...config.cryptoProvider, async encryptQuarantine() { throw failure; } } });
  await assert.rejects(writers.T0(input(tx, "T0", [row])), error => error === failure);
  assert(!tx.calls.some(call => call.sql.includes("finish-batch")));
});
