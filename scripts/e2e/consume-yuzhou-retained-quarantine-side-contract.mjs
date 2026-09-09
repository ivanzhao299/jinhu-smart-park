import test from "node:test";
import { prepareYuzhouRetainedQuarantineSide } from "../hr-cutover/consume-yuzhou-retained-quarantine-side.mjs";
import { createProductionImportArtifactCryptoProvider } from "../hr-cutover/execute-production-import.mjs";
import { decryptProductionImportEnvelope } from "../hr-cutover/production-import-crypto-provider.mjs";
import { captureYuzhouSideExecutionCommit, persistYuzhouLabFinalReceipt, readYuzhouLabFinalReceipt } from "../hr-cutover/run-yuzhou-real-bundle-lab.mjs";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
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

async function sideFixture(t) {
  const f = await fixture(t); f.config.stateRoot = f.root;
  f.input.existingConfig = await f.put("config.json", f.config);
  const receipt = await materializeYuzhouRetainedQuarantinePair(f.input);
  const descriptor = async path => ({ path, sha256: h(await readFile(path)) });
  const name = "jinhu_hr_migration_lab_sideaaa", side = f.input.sides.A;
  const c = { ...f.config, artifacts: { ...f.config.artifacts, runId: "side-run", operationId: side.operationId, target: { database: name } },
    container: name, containerId: h("container"), imageId: `sha256:${h("image")}`, port: 15433,
    resourceDescriptor: { database: name, container: name, containerId: h("container"), imageId: `sha256:${h("image")}`, port: 15433, composeProject: name, volume: { name, createdAt: "2026-09-09T00:00:00Z" }, network: { name, id: h("network") } },
    envelopes: await descriptor(join(side.outputDirectory, "envelopes.json")), keyFiles: [{ keyReferenceSha256: side.keyReferenceSha256, keyFile: side.keyFile }],
    pairMaterials: { side: "A", originalConfig: f.input.existingConfig, receipt: await descriptor(join(f.input.receiptDirectory, "pair-receipt.json")), sideReceipt: await descriptor(join(side.outputDirectory, "side-receipt.json")), overlays: await descriptor(join(side.outputDirectory, "overlays.json")) } };
  return { ...f, c, receipt };
}
test("materialized side projects deterministic records with original payload pins and authenticates using real provider", async t => {
  const f = await sideFixture(t), adapter = await prepareYuzhouRetainedQuarantineSide(f.c), again = await prepareYuzhouRetainedQuarantineSide(f.c);
  assert.equal(adapter.manifestSha256, again.manifestSha256); const manifest = JSON.parse(adapter.manifestBytes), phases = [], payloadBundles = {};
  for (const p of manifest.phases) {
    const bytes = await adapter.readArtifact(p.phaseArtifact.ref); assert.equal(h(bytes), p.phaseArtifact.sha256); phases.push(JSON.parse(bytes));
    payloadBundles[p.phase] = await adapter.readArtifact(p.payloadArtifact.ref);
    assert.deepEqual(payloadBundles[p.phase], await readFile(join(f.config.artifacts.preparedRoot, `${p.phase.toLowerCase()}-payload.json`)));
  }
  const provider = await createProductionImportArtifactCryptoProvider({ envelopeArtifact: JSON.parse(await readFile(f.c.envelopes.path)), keyFiles: f.c.keyFiles,
    plan: { operationId: manifest.operationId, targetScope: manifest.targetScope, phases }, payloadBundles, decryptEnvelope: decryptProductionImportEnvelope });
  provider.destroy(); assert.equal(manifest.binding.codeSha, f.config.artifacts.expectedTriple.codeSha);
  assert.equal(adapter.sourceProvenance.currentCommitVerified, false);
  await f.put("prepared/t0-records.json", {}); await assert.rejects(adapter.readArtifact("T0:records"), /LAB_SIDE_MATERIALS_INVALID/);
});
for (const [name, mutate] of [
  ["wrong side", f => f.c.pairMaterials.side = "B"], ["missing resource", f => delete f.c.resourceDescriptor],
  ["wrong operation", f => f.c.artifacts.operationId = f.config.artifacts.operationId],
  ["wrong key reference", f => f.c.keyFiles[0].keyReferenceSha256 = h("wrong")],
  ["cross package", f => f.c.artifacts.expectedSummarySha256 = h("wrong")],
  ["tampered receipt", f => f.c.pairMaterials.receipt.sha256 = h("wrong")],
  ["tampered overlays", f => f.c.pairMaterials.overlays.sha256 = h("wrong")],
]) test(`side rejects ${name}`, async t => { const f = await sideFixture(t); mutate(f); await assert.rejects(prepareYuzhouRetainedQuarantineSide(f.c), /^Error: LAB_SIDE_MATERIALS_INVALID$/); });
test("measured execution commit rejects drift and final receipt preserves separately bound prepared provenance", async t => {
  const f = await sideFixture(t), adapter = await prepareYuzhouRetainedQuarantineSide(f.c);
  let head = "b".repeat(40); const verify = captureYuzhouSideExecutionCommit({ currentHead: () => head });
  const executionCodeSha = verify(); head = "c".repeat(40); assert.throws(verify, /LAB_CLI_GUARD/);
  const identity = { runId: "receipt-side", configSha256: h("config"), manifestSha256: adapter.manifestSha256, binding: f.c.artifacts.binding };
  const result = { status: "FAILED", failureCodes: ["LAB_OWNER_HTTP_FAILED"], productionImport: "HOLD", sideExecutionProvenance: { executionCodeSha, executorSha256: identity.binding.executorSha256, runtimeTreeSha256: h("tree"), sourceProvenance: adapter.sourceProvenance } };
  await persistYuzhouLabFinalReceipt({ stateRoot: f.root, identity, result });
  const loaded = await readYuzhouLabFinalReceipt({ stateRoot: f.root, identity });
  assert.deepEqual(loaded.result.sideExecutionProvenance, result.sideExecutionProvenance);
  assert.notEqual(loaded.result.sideExecutionProvenance.executionCodeSha, identity.binding.codeSha);
  await assert.rejects(persistYuzhouLabFinalReceipt({ stateRoot: f.root, identity: { ...identity, runId: "receipt-invalid" }, result: { ...result, sideExecutionProvenance: { ...result.sideExecutionProvenance, executionCodeSha: "PRIVATE" } } }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
  await assert.rejects(persistYuzhouLabFinalReceipt({ stateRoot: f.root, identity: { ...identity, runId: "receipt-invalid" }, result: { ...result, sideExecutionProvenance: { ...result.sideExecutionProvenance, executorSha256: h("wrong") } } }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
});
test("projection rejects overlays on non-quarantine records without mutating inputs", async t => {
  const f = await sideFixture(t), overlays = JSON.parse(await readFile(f.c.pairMaterials.overlays.path)).overlays;
  f.phases[0].records[0].disposition = "insert";
  const before = JSON.stringify(f.phases);
  assert.throws(() => applyYuzhouQuarantineOverlays(f.phases, overlays), /LAB_PAIR_MATERIALIZER_INVALID/);
  assert.equal(JSON.stringify(f.phases), before);
});
