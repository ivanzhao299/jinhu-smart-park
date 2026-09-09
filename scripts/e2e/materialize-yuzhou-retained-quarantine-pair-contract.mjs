import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { materializeYuzhouRetainedQuarantinePair, applyYuzhouQuarantineOverlays } from "../hr-cutover/materialize-yuzhou-retained-quarantine-pair.mjs";
import { encryptProductionImportEnvelope } from "../hr-cutover/production-import-crypto-provider.mjs";
import { computeProductionImportPayloadHash, computeProductionImportPayloadBundleHash, computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
const h = x => createHash("sha256").update(x).digest("hex");
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pair-materializer-"))); t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, v, raw = false) => { const path = join(root, name), b = raw ? v : Buffer.from(JSON.stringify(v)); await writeFile(path, b, { mode: 0o600 }); return { path, sha256: h(b) }; };
  for (const d of ["prepared", "a", "b", "receipt"]) await mkdir(join(root, d), { mode: 0o700 });
  const keys = [1, 2, 3].map(n => Buffer.alloc(32, n)), refs = keys.map((_, i) => h(`ref${i}`));
  const keyFiles = await Promise.all(keys.map((k, i) => put(`key${i}`, k, true)));
  const targetScope = { tenantId: "tenant", parkId: "park" }; targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);
  const operationId = "yzprod-import-20260909T000000Z-aaaaaaaaaaaa", triple = { codeSha: "a".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") };
  const payload = { remark: null, name: "SYNTHETIC PRIVATE" }, record = { disposition: "quarantine", sourceSystem: "yuzhou-v10", sourceTable: "dbo.departmentcode", plannedTargetTable: "sys_org", sourceIdentitySha256: h("id"), sourceRowSha256: h("row"), payloadSha256: computeProductionImportPayloadHash(payload) };
  const sealed = await encryptProductionImportEnvelope({ kind: "quarantine", operationId, targetScope, phaseName: "T0", record, keyReferenceSha256: refs[0], value: payload }, { resolveKey: async () => keys[0] });
  record.quarantine = { ...sealed.binding, reasonCode: "TEST_REASON" };
  const summary = { status: "WRITER_INPUTS_PREPARED", triple, phases: [], databaseWrites: 0, productionImport: "HOLD" };
  const phases = [];
  for (const [i, phase] of ["T0", "T1", "T2", "T3"].entries()) {
    const records = i === 0 ? [record] : [], bundle = { phase, targetScope, sourceBatchManifestSha256: h("batch"), records: records.map(r => ({ ...r, payload })) };
    phases.push({ phase, records });
    await put(`prepared/${phase.toLowerCase()}-records.json`, { phase, ordinal: i, sourceBatchManifestSha256: h("batch"), records });
    await put(`prepared/${phase.toLowerCase()}-payload.json`, bundle);
    summary.phases.push({ phase, payloadBundleSha256: computeProductionImportPayloadBundleHash(bundle) });
  }
  const summaryFile = await put("prepared/summary.json", summary), e = sealed.envelope;
  const envelopes = await put("envelopes.json", { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_crypto_envelopes", operationId, entries: [{ kind: "quarantine", phaseName: "T0", sourceIdentitySha256: record.sourceIdentitySha256, envelope: { algorithm: e.algorithm, keyReferenceSha256: e.keyReferenceSha256, nonceHex: e.nonce.toString("hex"), authenticationTagHex: e.authenticationTag.toString("hex"), ciphertextHex: e.ciphertext.toString("hex") } }] });
  const config = { artifacts: { preparedRoot: join(root, "prepared"), expectedSummarySha256: summaryFile.sha256, expectedTriple: triple,
    binding: { codeSha: triple.codeSha, sourceSnapshotHash: triple.sourceSnapshotHash, mappingSha256: triple.mappingContractHash, executorSha256: h("executor") }, target: { database: "jinhu_hr_migration_lab_source" }, targetScope, runId: "source-run", operationId,
    expectedCounts: { records: 1, inserted: 0, quarantined: 1 }, httpCounts: { employees: 1, contracts: 1, attendanceCalendars: 1, insurancePeriods: 1 } }, envelopes, keyFiles: [{ keyReferenceSha256: refs[0], keyFile: keyFiles[0] }] };
  const input = { existingConfig: await put("config.json", config), receiptDirectory: join(root, "receipt"), sides: Object.fromEntries(["A", "B"].map((side, i) => [side, { operationId: operationId.replace(/a+$/, (i ? "c" : "b").repeat(12)), keyReferenceSha256: refs[i + 1], keyFile: keyFiles[i + 1], outputDirectory: join(root, side.toLowerCase()) }])) };
  return { input, phases, root, put, config, keys };
}
test("private materializer reads verified source, publishes readback-pinned ciphertext/overlays and receipt last", async t => {
  const f = await fixture(t), original = await readFile(f.input.existingConfig.path), receipt = await materializeYuzhouRetainedQuarantinePair(f.input);
  assert.equal(receipt.status, "PAIR_QUARANTINE_MATERIALS_READY"); assert.equal(receipt.formalABVerified, false);
  assert.deepEqual(await readFile(f.input.existingConfig.path), original);
  for (const side of ["A", "B"]) {
    const dir = f.input.sides[side].outputDirectory, bytes = await readFile(join(dir, "overlays.json"));
    assert.equal(h(bytes), receipt.sides[side].artifacts["overlays.json"].sha256);
    const overlays = JSON.parse(bytes).overlays, applied = applyYuzhouQuarantineOverlays(f.phases, overlays);
    assert.equal(applied[0].records[0].quarantine.reasonCode, "TEST_REASON");
    assert.notEqual(applied[0].records[0].quarantine.keyReferenceSha256, f.phases[0].records[0].quarantine.keyReferenceSha256);
    assert.equal(bytes.includes("SYNTHETIC PRIVATE"), false);
    for (const changed of [[], [...overlays, overlays[0]], [{ ...overlays[0], sourceRowSha256: h("wrong") }], [{ ...overlays[0], sourceIdentitySha256: h("wrong") }], [{ ...overlays[0], payloadSha256: h("wrong") }]]) assert.throws(() => applyYuzhouQuarantineOverlays(f.phases, changed), /LAB_PAIR_MATERIALIZER_INVALID/);
  }
  assert.deepEqual(JSON.parse(await readFile(join(f.input.receiptDirectory, "pair-receipt.json"))), receipt);
});
test("valid B/A input key order does not change side directory identity", async t => {
  const f = await fixture(t);
  f.input.sides = { B: f.input.sides.B, A: f.input.sides.A };
  const receipt = await materializeYuzhouRetainedQuarantinePair(f.input);
  for (const side of ["A", "B"]) {
    const bytes = await readFile(join(f.input.sides[side].outputDirectory, "envelopes.json"));
    assert.equal(JSON.parse(bytes).operationId, f.input.sides[side].operationId);
    assert.equal(h(bytes), receipt.sides[side].artifacts["envelopes.json"].sha256);
  }
});
for (const [name, mutate] of [
  ["wrong config hash", async f => f.input.existingConfig.sha256 = h("bad")],
  ["wrong key hash", async f => f.input.sides.A.keyFile.sha256 = h("bad")],
  ["same actual key", async f => f.input.sides.A.keyFile = await f.put("same-key", f.keys[0], true)],
  ["occupied directory", async f => f.put("a/existing.json", {})],
  ["symlink output", async f => { await symlink(f.input.sides.A.outputDirectory, join(f.root, "alias")); f.input.sides.A.outputDirectory = join(f.root, "alias"); }],
  ["symlink key", async f => { await symlink(f.input.sides.A.keyFile.path, join(f.root, "key-link")); f.input.sides.A.keyFile.path = join(f.root, "key-link"); }],
  ["tampered payload", async f => f.put("prepared/t0-payload.json", {})],
]) test(`reject ${name} without ready receipt`, async t => { const f = await fixture(t); await mutate(f); await assert.rejects(materializeYuzhouRetainedQuarantinePair(f.input), /^Error: LAB_PAIR_MATERIALIZER_INVALID$/); assert.deepEqual(await readdir(f.input.receiptDirectory), []); });
