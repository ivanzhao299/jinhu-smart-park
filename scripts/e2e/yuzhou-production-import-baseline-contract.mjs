import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fixture } from "./production-import-plan-test-fixture.mjs";
import { collectProductionImportBaseline, materializeProductionImportBaseline } from "../hr-cutover/collect-production-import-baseline.mjs";
import { computeProductionImportTargetCanonicalHash } from "../hr-cutover/production-import-target-model.mjs";
const H = s => createHash("sha256").update(s).digest("hex"), NOW = new Date("2026-09-09T01:00:00.000Z");
function setup(t, handler = () => undefined) {
  const f = fixture(t), scope = f.metadata.targetScope;
  const binding = { database: "synthetic", databaseUser: "synthetic_reader", targetIdentitySha256: "", targetScope: scope, serverIdentity: { address: "127.0.0.1", port: 5432, databaseOid: "123" } };
  binding.targetIdentitySha256 = H(`yuzhou-hr-production-target-v1:${[binding.database, binding.databaseUser, binding.serverIdentity.address, "5432", "123", scope.tenantId, scope.parkId].join("\x1f")}`);
  f.metadata.target.identitySha256 = binding.targetIdentitySha256; f.runtime.targetIdentitySha256 = binding.targetIdentitySha256;
  f.contract.activation.allowedTargets[0].identitySha256 = binding.targetIdentitySha256;
  f.config.artifacts.metadata = f.put("metadata.json", f.metadata); f.config.artifacts.runtime = f.put("runtime.json", f.runtime);
  const phases = Object.fromEntries(Object.entries(f.config.artifacts.phases).map(([name, d]) => [name, JSON.parse(readFileSync(d.records.path))]));
  const calls = [];
  const client = { async connect() { calls.push(["connect"]); }, async end() { calls.push(["end"]); }, async query(sql, params = []) {
    calls.push([sql, params]); const override = handler(sql, params); if (override !== undefined) return override;
    if (sql.includes("current_database()")) return { rows: [{ database_name: binding.database, database_user: binding.databaseUser, server_address: binding.serverIdentity.address, server_port: 5432, database_oid: "123", tenant_exists: true, park_exists: true }] };
    return { rows: [] };
  } };
  const connection = { host: "127.0.0.1", port: 5432, database: binding.database, user: binding.databaseUser, password: "synthetic-only" };
  const input = { connection, binding, triple: f.triple, phases, now: NOW, expiresAt: "2026-09-09T01:30:00.000Z", batchSize: 1 };
  return { ...f, binding, phases, calls, client, input, options: { createClient: () => client } };
}
test("same readonly snapshot, batch absence, private artifact directly accepted by materializer", async t => {
  const f = setup(t), outputDir = join(f.root, "baseline-output"); mkdirSync(outputDir, { mode: 0o700 });
  const config = { formatVersion: 1, triple: f.triple, binding: f.binding, connection: { host: "127.0.0.1", port: 5432, database: f.binding.database, user: f.binding.databaseUser, password: "synthetic-only" },
    phases: Object.fromEntries(Object.entries(f.config.artifacts.phases).map(([p, d]) => [p, d.records])), expiresAt: f.input.expiresAt, outputDir };
  const receipt = await materializeProductionImportBaseline(f.put("baseline-config.json", config).path, { currentHead: () => f.triple.codeSha, now: NOW, createClient(options) { assert.equal(options.options, "-c default_transaction_read_only=on"); return f.client; } });
  assert.equal(receipt.status, "BASELINE_COLLECTED");
  f.config.artifacts.baseline = { path: join(outputDir, "touched-baseline.json"), sha256: receipt.artifacts["touched-baseline.json"].sha256 };
  assert.equal(f.run().status, "DRAFT_MATERIALIZED");
  const sql = f.calls.map(c => c[0]).filter(s => !["connect", "end"].includes(s));
  assert.equal(sql[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); assert.equal(sql.at(-1), "ROLLBACK");
  assert.match(sql[1], /statement_timeout/u); assert.match(sql[1], /idle_in_transaction_session_timeout/u);
  assert.ok(sql.every(s => !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|COMMIT)\b/u.test(s)));
  const absence = sql.find(s => s.includes("hr-prod-baseline:absence")); assert.doesNotMatch(absence, /tenant_id|park_id|is_deleted/u);
});
test("batch IDs bounded, quarantine issues no business SELECT", async t => {
  const f = setup(t); const r = f.phases.T0.records[0]; f.phases.T0.records.push({ ...r, targetId: "00000000-0000-4000-8000-000000000099" }, { ...r, disposition: "quarantine" });
  const b = await collectProductionImportBaseline(f.input, f.options); assert.equal(b.phases.T0.absent.length, 2);
  assert.equal(f.calls.filter(c => c[0].includes("hr-prod-baseline:absence")).length, 2);
  assert.ok(f.calls.filter(c => c[0].includes("hr-prod-baseline:absence")).every(c => c[1][0].length === 1));
});
for (const disposition of ["merge", "skip_approved"]) test(`exact ${disposition} row canonical/version and no FOR UPDATE`, async t => {
  let dbrow; const f = setup(t, sql => sql.includes("lock-existing") ? { rows: [dbrow] } : undefined);
  const r = f.phases.T0.records[0], payload = JSON.parse(readFileSync(f.config.artifacts.phases.T0.payload.path)).records[0].payload;
  r.disposition = disposition; r.expectedTargetVersionBefore = 7; r.expectedTargetBeforeSha256 = r.expectedTargetAfterSha256;
  dbrow = { id: r.targetId, version: 7, ...payload, parent_id: null };
  const b = await collectProductionImportBaseline(f.input, f.options); assert.equal(b.phases.T0.rows[0].version, 7); assert.deepEqual(b.phases.T0.rows[0].payload, payload);
  assert.doesNotMatch(f.calls.find(c => c[0].includes("lock-existing"))[0], /FOR UPDATE/u);
});
for (const defect of ["collision", "foreign_scope", "soft_deleted", "version", "canonical", "wrong_user", "identity", "timeout", "rollback"]) test(`reject ${defect}; rollback and safe failure`, async t => {
  const f = setup(t, sql => {
    if (defect === "timeout" && sql.includes("hr-prod-baseline:absence")) { const e = new Error("private sql must not escape"); e.code = "57014"; throw e; }
    if (defect === "rollback" && sql === "ROLLBACK") throw new Error("private transport");
    if (defect === "collision" && sql.includes("hr-prod-baseline:absence")) return { rows: [{ id: "any-existing-id" }] };
    if (["foreign_scope", "soft_deleted"].includes(defect) && sql.includes("lock-existing")) { assert.match(sql, /tenant_id=\$1 AND park_id=\$2/u); assert.match(sql, /is_deleted=false/u); return { rows: [] }; }
    if (["version", "canonical"].includes(defect) && sql.includes("lock-existing")) { const p = JSON.parse(readFileSync(f.config.artifacts.phases.T0.payload.path)).records[0].payload; return { rows: [{ id: f.phases.T0.records[0].targetId, ...p, parent_id: null, version: defect === "version" ? 2 : 1, ...(defect === "canonical" ? { org_name: "changed" } : {}) }] }; }
    if (defect === "wrong_user" && sql.includes("current_database()")) return { rows: [{ database_name: f.binding.database, database_user: "different" }] };
    return undefined;
  });
  if (["foreign_scope", "soft_deleted", "version", "canonical"].includes(defect)) { const r = f.phases.T0.records[0]; r.disposition = "merge"; r.expectedTargetVersionBefore = 1; r.expectedTargetBeforeSha256 = r.expectedTargetAfterSha256; }
  if (defect === "identity") f.binding.targetIdentitySha256 = H("false");
  await assert.rejects(() => collectProductionImportBaseline(f.input, f.options), e => /^PRODUCTION_IMPORT_[A-Z_]+$/u.test(e.message) && !e.message.includes("private"));
  assert.equal(f.calls.at(-2)[0], "ROLLBACK"); assert.equal(f.calls.at(-1)[0], "end");
});
test("microsecond event timestamp preserved", async t => {
  let dbrow; const f = setup(t, sql => sql.includes("lock-existing") ? { rows: [dbrow] } : undefined);
  f.phases.T0.records = [];
  const payload = { event_type: "hire", status: "completed", effective_date: "2020-01-02", completed_at: null, cancelled_at: null, cancel_reason: null, source_document_no: "SYN", source_event_code: "JZ", source_status: "1", source_reason: null, source_effective_at: "2020-01-02T12:30:45.123456+08:00", legacy_snapshot: {}, reason: null };
  // Model field list drives this synthetic row; no production fixture data.
  const { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL: model } = await import("../hr-cutover/production-import-target-model.mjs");
  const rule = model.targetTables.hr_employment_event;
  for (const key of Object.keys(payload)) if (!rule.fieldWhitelist.includes(key)) delete payload[key];
  for (const key of rule.fieldWhitelist) if (!(key in payload)) payload[key] = null;
  const derivedFields = Object.fromEntries(rule.derivedFields.map(k => [k, k === "employee_id" ? "00000000-0000-4000-8000-000000000050" : null]));
  const canonical = computeProductionImportTargetCanonicalHash("hr_employment_event", f.binding.targetScope, payload, derivedFields);
  const id = "00000000-0000-4000-8000-000000000060";
  f.phases.T1.records = [{ plannedTargetTable: "hr_employment_event", targetTable: "hr_employment_event", targetId: id, disposition: "skip_approved", expectedTargetVersionBefore: 1, expectedTargetBeforeSha256: canonical, expectedTargetAfterSha256: canonical }];
  dbrow = { id, version: 1, ...payload, ...derivedFields };
  const b = await collectProductionImportBaseline(f.input, f.options); assert.equal(b.phases.T1.rows[0].payload.source_effective_at, payload.source_effective_at);
  assert.match(f.calls.find(c => c[0].includes("lock-existing"))[0], /HH24:MI:SS.US/u);
});
test("decimal SQL projection/readback retains exact text", async t => {
  let dbrow; const f = setup(t, sql => sql.includes("lock-existing") ? { rows: [dbrow] } : undefined);
  const { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL: model } = await import("../hr-cutover/production-import-target-model.mjs");
  const table = "hr_employee_insurance_item", rule = model.targetTables[table];
  const field = rule.decimalStringFields[0]; assert.ok(field);
  const payload = Object.fromEntries(rule.fieldWhitelist.map(k => [k, null])); payload[field] = "1234567890.1200";
  const derived = Object.fromEntries(rule.derivedFields.map(k => [k, "00000000-0000-4000-8000-000000000050"]));
  const id = "00000000-0000-4000-8000-000000000070", canonical = computeProductionImportTargetCanonicalHash(table, f.binding.targetScope, payload, derived);
  f.phases.T0.records = []; f.phases.T3.records = [{ plannedTargetTable: table, targetTable: table, targetId: id, disposition: "skip_approved", expectedTargetVersionBefore: 1, expectedTargetBeforeSha256: canonical, expectedTargetAfterSha256: canonical }];
  dbrow = { id, version: 1, ...payload, ...derived };
  const b = await collectProductionImportBaseline(f.input, f.options); assert.equal(b.phases.T3.rows[0].payload[field], "1234567890.1200");
  assert.ok(f.calls.find(c => c[0].includes("lock-existing"))[0].includes(`${field}::text AS ${field}`));
});
test("failed actual CLI collection emits no receipt or baseline", async t => {
  const f = setup(t, sql => { if (sql.includes("hr-prod-baseline:absence")) throw new Error("synthetic private query failure"); });
  const outputDir = join(f.root, "failed-output"); mkdirSync(outputDir, { mode: 0o700 });
  const c = { formatVersion: 1, triple: f.triple, binding: f.binding, connection: { host: "127.0.0.1", port: 5432, database: f.binding.database, user: f.binding.databaseUser, password: "synthetic-only" },
    phases: Object.fromEntries(Object.entries(f.config.artifacts.phases).map(([p, d]) => [p, d.records])), expiresAt: f.input.expiresAt, outputDir };
  await assert.rejects(() => materializeProductionImportBaseline(f.put("failed-config.json", c).path, { currentHead: () => f.triple.codeSha, now: NOW, createClient: () => f.client }), /PRODUCTION_IMPORT_BASELINE_QUERY_FAILED/u);
  assert.deepEqual(readdirSync(outputDir), []); assert.equal(f.calls.at(-1)[0], "end");
});
test("owned factory connects before SQL and closes on failed connect; borrowed client rejected", async t => {
  const f = setup(t); let created = 0, connected = 0, ended = 0, queried = 0;
  await assert.rejects(() => collectProductionImportBaseline(f.input, { createClient(options) {
    created += 1; assert.equal(options.options, "-c default_transaction_read_only=on");
    return { async connect() { connected += 1; throw new Error("already connected synthetic client"); }, async query() { queried += 1; }, async end() { ended += 1; } };
  } }), /PRODUCTION_IMPORT_BASELINE_QUERY_FAILED/u);
  assert.deepEqual([created, connected, queried, ended], [1, 1, 0, 1]);
  await assert.rejects(() => collectProductionImportBaseline({ ...f.input, client: f.client }, f.options), /PRODUCTION_IMPORT_BASELINE_CLIENT_INVALID/u);
  assert.deepEqual(f.calls, []);
});

test("Unix socket collector passes explicit host to pg and hashes empty transport components", async t => {
  const f = setup(t, sql => sql.includes("current_database()") ? { rows: [{ database_name: "synthetic", database_user: "synthetic_reader", server_address: null, server_port: null, database_oid: "123", tenant_exists: true, park_exists: true }] } : undefined);
  f.binding.serverIdentity.address = null; f.binding.serverIdentity.port = null;
  f.binding.targetIdentitySha256 = H(`yuzhou-hr-production-target-v1:${[f.binding.database, f.binding.databaseUser, "", "", "123", f.binding.targetScope.tenantId, f.binding.targetScope.parkId].join("\x1f")}`);
  f.input.connection.host = "/synthetic/postgres-socket";
  let creations = 0;
  const value = await collectProductionImportBaseline(f.input, { createClient(options) { creations += 1; assert.equal(options.host, "/synthetic/postgres-socket"); assert.equal(options.port, 5432); return f.client; } });
  assert.equal(creations, 1); assert.equal(value.targetIdentitySha256, f.binding.targetIdentitySha256);
});

test("Unix socket observations cannot reuse a TCP identity hash", async t => {
  const f = setup(t, sql => sql.includes("current_database()") ? { rows: [{ database_name: "synthetic", database_user: "synthetic_reader", server_address: null, server_port: null, database_oid: "123", tenant_exists: true, park_exists: true }] } : undefined);
  f.binding.serverIdentity.address = null; f.binding.serverIdentity.port = null; f.input.connection.host = "/synthetic/postgres-socket";
  await assert.rejects(() => collectProductionImportBaseline(f.input, f.options), e => e.code === "PRODUCTION_IMPORT_BASELINE_IDENTITY_MISMATCH");
  assert.equal(f.calls.some(c => c[0].includes("hr-prod-baseline:absence")), false);
  assert.equal(f.calls.at(-2)[0], "ROLLBACK"); assert.equal(f.calls.at(-1)[0], "end");
});
