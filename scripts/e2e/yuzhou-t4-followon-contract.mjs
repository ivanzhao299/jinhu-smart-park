/* global structuredClone */
import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalT4, hashT4, validateT4Authorization, validateT4Binding } from "../hr-cutover/production-import-t4-followon-binding.mjs";
import { readT4PrivateArtifact, readT4PrivateStage, t4PostgresStageRow } from "../hr-cutover/production-import-t4-followon-private-stage.mjs";
import { Buffer } from "node:buffer";
import { validateT4Runtime } from "../hr-cutover/execute-production-t4-followon.mjs";
import { fixtureAuthorization, fixtureBinding } from "./yuzhou-t4-followon-fixture.mjs";

test("legacy NUL name has a reversible transient representation without changing source hashes or values", () => {
  const row = { source: { name: "Synthetic\0姓名\\u0000", person: "fixture-person" }, sourceRowSha256: "a".repeat(64), values: [{ value: { decimal: "12.3400" } }] };
  const before = JSON.stringify(row), staged = t4PostgresStageRow(row);
  assert.equal(Buffer.from(staged.source.name.value, "base64").toString("utf8"), row.source.name);
  assert.equal(staged.source.name.encoding, "utf8-base64");
  assert.equal(staged.source.person, row.source.person);
  assert.equal(staged.sourceRowSha256, row.sourceRowSha256);
  assert.strictEqual(staged.values, row.values);
  assert.equal(JSON.stringify(row), before);
  const ordinary = { source: { name: "Synthetic\\u0000" } };
  assert.strictEqual(t4PostgresStageRow(ordinary), ordinary);
});

test("T4 authorization explicitly binds full-archive append and parent hashes", () => {
  const binding = fixtureBinding(), authorization = fixtureAuthorization(binding);
  assert.equal(typeof validateT4Authorization({ binding, authorization }), "string");
  const wrong = structuredClone(binding); wrong.intent = "production_import";
  assert.throws(() => validateT4Authorization({ binding: wrong, authorization }), /T4_INTENT_INVALID/);
  const mutated = structuredClone(binding); mutated.parent.payloadBundleSha256.T0 = "e".repeat(64);
  assert.throws(() => validateT4Authorization({ binding: mutated, authorization }), /T4_AUTHORIZATION_INTENT_MISMATCH/);
});
test("rollback needs its own signed intent and nonce", () => {
  const binding = fixtureBinding(), append = fixtureAuthorization(binding), rollback = fixtureAuthorization(binding, "rollback");
  assert.throws(() => validateT4Authorization({ binding, authorization: append, intent: "rollback" }), /T4_AUTHORIZATION_INTENT_MISMATCH/);
  assert.notEqual(append.context.nonceSha256, rollback.context.nonceSha256);
  assert.equal(typeof validateT4Authorization({ binding, authorization: rollback, intent: "rollback" }), "string");
});
test("expired, altered amount and altered signed policy fail", () => {
  const binding = fixtureBinding(), authorization = fixtureAuthorization(binding);
  assert.throws(() => validateT4Authorization({ binding, authorization, now: new Date(Date.now() + 86401000) }), /T4_AUTHORIZATION_EXPIRED/);
  const changed = structuredClone(binding); changed.amountTotals.full.gross_total = "1.0000";
  assert.throws(() => validateT4Authorization({ binding: changed, authorization }), /T4_AUTHORIZATION_INTENT_MISMATCH/);
  authorization.approvalPolicy.operatorAttestation.signatureBase64 = "A".repeat(88);
  assert.throws(() => validateT4Authorization({ binding, authorization }), /SINGLE_OWNER_POLICY_INVALID/);
});
test("unsupported windows, duplicate parent operation, floats and counts fail", () => {
  for (const change of [b => { b.mode = "hot_history"; }, b => { b.operationId = b.parent.operationId; }, b => { b.amountTotals.full.net_total = 102194056.8; }, b => { b.counts = { ...b.counts, sourceRows: 1 }; }]) {
    const binding = fixtureBinding(); change(binding); assert.throws(() => validateT4Binding(binding));
  }
});
test("runtime drift fails independently of source parent C", () => {
  const binding = fixtureBinding();
  assert.notEqual(binding.executionCodeSha, binding.triple.codeSha);
  assert.throws(() => validateT4Runtime(binding, { currentCodeSha: binding.triple.codeSha }, binding.executionCodeSha), /T4_RUNTIME_SHA_OR_SCOPE_DRIFT/);
});
test("private descriptor enforces bytes, mode and no symlinks", () => {
  const dir = mkdtempSync(join(tmpdir(), "t4-private-contract-"));
  try {
    const file = join(dir, "artifact.json"); writeFileSync(file, "{}", { mode: 0o600 });
    assert.equal(readT4PrivateArtifact({ path: file, sha256: hashT4("{}") }).toString(), "{}");
    assert.throws(() => readT4PrivateArtifact({ path: file, sha256: "a".repeat(64) }), /T4_ARTIFACT_HASH_MISMATCH/);
    chmodSync(file, 0o644); assert.throws(() => readT4PrivateArtifact({ path: file, sha256: hashT4("{}") }));
    chmodSync(file, 0o600); const link = join(dir, "link"); symlinkSync(file, link);
    assert.throws(() => readT4PrivateArtifact({ path: link, sha256: hashT4("{}") }));
  } finally { rmSync(dir, { recursive: true }); }
});
test("all six hashes, HOLD source manifest, mapping and source are bound", () => {
  const dir = mkdtempSync(join(tmpdir(), "t4-stage-contract-"));
  try {
    const binding = fixtureBinding(), files = {};
    for (const name of Object.keys(binding.files)) { const path = join(dir, name); const bytes = JSON.stringify({ sourceRowSha256: hashT4(name) }) + "\n"; writeFileSync(path, bytes, { mode: 0o600 }); files[name] = { path, sha256: hashT4(bytes) }; binding.files[name] = files[name].sha256; }
    const manifest = { formatVersion: 1, productionImport: "HOLD", profileVersion: "fixture", sourceBackupSha256: binding.triple.sourceSnapshotHash, mappingContractSha256: binding.triple.mappingContractHash, sourceRestoreReceiptSha256: binding.sourceRestoreReceiptSha256, actualSourceRows: "46092", minimumYear: "2010", maximumYear: "2026", actualCatalogSha256: hashT4("catalog"), outputFiles: Object.fromEntries(Object.entries(binding.files).map(([name, fileSha256]) => [name, { fileSha256 }])) };
    manifest.businessContentSha256 = hashT4(canonicalT4({ profileVersion: manifest.profileVersion, catalogSha256: manifest.actualCatalogSha256, outputFiles: binding.files }));
    binding.sourceBusinessSha256 = manifest.businessContentSha256;
    const path = join(dir, "manifest.json"), bytes = JSON.stringify(manifest); writeFileSync(path, bytes, { mode: 0o600 }); binding.manifestSha256 = hashT4(bytes);
    const input = { manifest: { path, sha256: binding.manifestSha256 }, files };
    assert.equal(Object.keys(readT4PrivateStage(input, binding).buffers).length, 6);
    files["tax-rules.jsonl"].sha256 = "a".repeat(64);
    assert.throws(() => readT4PrivateStage(input, binding), /T4_FILE_BINDING_MISMATCH/);
  } finally { rmSync(dir, { recursive: true }); }
});
