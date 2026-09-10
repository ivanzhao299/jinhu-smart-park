import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runYuzhouRetainedBundlePair, runYuzhouPairSideProcess } from "../hr-cutover/run-yuzhou-retained-bundle-pair.mjs";
import process from "node:process";
import { LAB_EXECUTION_DEPENDENCIES, persistYuzhouLabFinalReceipt } from "../hr-cutover/run-yuzhou-real-bundle-lab.mjs";
const h = x => createHash("sha256").update(x).digest("hex");
test("each side crosses fixed Node process boundary and never forwards raw stderr or result extras", async () => {
  const calls = [], execute = async (file, argv, options) => {
    calls.push({ file, argv, options });
    return { stdout: JSON.stringify({ status: "LAB_PASS", finalReceiptPersisted: true, finalReceiptSha256: h("receipt"), secret: "PRIVATE" }), stderr: "PRIVATE STDERR" };
  };
  for (const side of ["A", "B"]) {
    const result = await runYuzhouPairSideProcess({ mode: "execute-isolated", configPath: `/private/${side}.json`, configSha256: h(side) }, { execute });
    assert.equal(result.status, "LAB_PASS"); assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  }
  assert.equal(calls.length, 2); assert.equal(calls[0].file, process.execPath);
  assert.match(calls[0].argv[0], /\/scripts\/hr-cutover\/run-yuzhou-real-bundle-lab\.mjs$/);
  assert.deepEqual(calls[0].argv.slice(1), ["--execute-isolated", "--config", "/private/A.json", "--config-sha256", h("A")]);
  assert.notEqual(calls[0].argv[3], calls[1].argv[3]); assert.equal(calls[0].options.shell, undefined);
  const failed = await runYuzhouPairSideProcess({ mode: "execute-isolated", configPath: "/private/A.json", configSha256: h("A") }, { execute: async () => { throw new Error("RAW SECRET STDERR"); } });
  assert.deepEqual(failed, { status: "FAILED", failureCode: "LAB_PAIR_SIDE_PROCESS_FAILED" });
});
test("real child CLI rejects nonexistent private config without DB or raw diagnostics", async () => {
  const result = await runYuzhouPairSideProcess({ mode: "execute-isolated", configPath: "/nonexistent-synthetic-pair-config.json", configSha256: h("absent") });
  assert.deepEqual(result, { status: "FAILED", failureCode: "LAB_PAIR_SIDE_PROCESS_FAILED" });
});
async function fixture(t, defect) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pair-owner-"))); t.after(() => rm(root, { recursive: true, force: true }));
  const out = join(root, "out"); await mkdir(out, { mode: 0o700 });
  const pin = { path: join(root, "unopened"), sha256: h("pin") }, configs = {}, input = { outputDirectory: out }, calls = [];
  for (const [i, side] of ["A", "B"].entries()) {
    const name = `jinhu_hr_migration_lab_${side.toLowerCase().repeat(6)}`;
    const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") };
    const c = { formatVersion: 1, artifacts: { preparedRoot: root, expectedSummarySha256: h("summary"), expectedTriple: triple,
      binding: { codeSha: triple.codeSha, sourceSnapshotHash: triple.sourceSnapshotHash, mappingSha256: triple.mappingContractHash, executorSha256: h("executor") },
      target: { database: name }, targetScope: {}, runId: `pair-run-${side}`, operationId: `yzprod-import-20260909T000000Z-${side.toLowerCase().repeat(12)}`,
      expectedCounts: { records: 2, inserted: 1, quarantined: 1 }, httpCounts: { employees: 1, contracts: 1, attendanceCalendars: 1, insurancePeriods: 1 } },
      stateRoot: root, container: name, containerId: h(side), imageId: `sha256:${h("image")}`, port: 15432 + i,
      dependencies: Object.fromEntries(LAB_EXECUTION_DEPENDENCIES.map(p => [p, h(p)])), runtimeTreeSha256: h("runtime"), envelopes: pin, keyFiles: [{ keyReferenceSha256: h(`key${side}`), keyFile: pin }], baselineCounts: {}, phaseCounts: {},
      resourceDescriptor: { database: name, container: name, containerId: h(side), imageId: `sha256:${h("image")}`, port: 15432 + i, composeProject: name, volume: { name, createdAt: "2026-09-09T00:00:00Z" }, network: { name, id: h(`network${side}`) } },
      pairMaterials: { side, originalConfig: pin, receipt: pin, sideReceipt: pin, overlays: pin } };
    configs[side] = c;
  }
  const save = async () => { for (const side of ["A", "B"]) { const bytes = Buffer.from(JSON.stringify(configs[side])), path = join(root, `${side}.json`); await writeFile(path, bytes, { mode: 0o600 }); input[side] = { path, sha256: h(bytes) }; } };
  await save();
  const runSide = async args => {
    const side = args.configPath === input.A.path ? "A" : "B", c = configs[side]; calls.push(side);
    if (defect === "A-fails" && side === "A") return { status: "FAILED" };
    if (defect === "missing") return { status: "LAB_PASS", finalReceiptPersisted: true, finalReceiptSha256: h("missing") };
    const result = { status: "LAB_PASS", counts: c.artifacts.expectedCounts, httpVerified: true, rollbackVerified: true, residualVerified: true, failureCodes: [], productionImport: "HOLD",
      sideExecutionProvenance: { executionCodeSha: defect === "code" && side === "B" ? "d".repeat(40) : "c".repeat(40), executorSha256: c.artifacts.binding.executorSha256, runtimeTreeSha256: c.runtimeTreeSha256,
        sourceProvenance: { preparedTriple: c.artifacts.expectedTriple, originalConfigSha256: pin.sha256, pairMaterialsReceiptSha256: pin.sha256, side, currentCommitVerified: false } } };
    const identity = { runId: c.artifacts.runId, configSha256: args.configSha256, manifestSha256: h(`manifest${side}`), binding: c.artifacts.binding };
    const receipt = await persistYuzhouLabFinalReceipt({ stateRoot: root, identity, result });
    if (defect === "tamper" && side === "A") await writeFile(join(root, `final-${identity.runId}.json`), "{}");
    return { ...result, ...receipt };
  };
  return { input, configs, calls, runSide, save };
}
test("serial owner re-reads persisted side receipts and reports DB lifecycle evidence, not formal pair/cleanup", async t => {
  const f = await fixture(t), result = await runYuzhouRetainedBundlePair(f.input, f);
  assert.equal(result.status, "RETAINED_PAIR_DATABASE_LIFECYCLES_PASS"); assert.deepEqual(f.calls, ["A", "B"]);
  assert.equal(result.evidenceMode, "synthetic_adapter"); assert.equal(result.dockerResourcesCleaned, false); assert.equal(result.formalFinalRehearsalPairProduced, false);
  assert.deepEqual(JSON.parse(await readFile(join(f.input.outputDirectory, "pair-lifecycle-receipt.json"))), result);
});
for (const defect of [null, "receipt-pin", "manifest-pin", "code"]) test(`existing receipt verification never calls runner: ${defect ?? "pass"}`, async t => {
  const f = await fixture(t, defect === "code" ? "code" : undefined);
  const existingReceipts = {};
  for (const side of ["A", "B"]) {
    const r = await f.runSide({ configPath: f.input[side].path, configSha256: f.input[side].sha256 });
    existingReceipts[side] = { receiptSha256: r.finalReceiptSha256, manifestSha256: h(`manifest${side}`) };
  }
  if (defect === "receipt-pin") existingReceipts.A.receiptSha256 = h("wrong");
  if (defect === "manifest-pin") existingReceipts.A.manifestSha256 = h("wrong");
  f.calls.length = 0;
  const result = await runYuzhouRetainedBundlePair({ ...f.input, existingReceipts }, { runSide: async () => { throw Error("MUST_NOT_EXECUTE"); } });
  assert.deepEqual(f.calls, []);
  if (defect) { assert.equal(result.status, "FAILED"); assert.deepEqual(await readdir(f.input.outputDirectory), []); }
  else { assert.equal(result.status, "RETAINED_PAIR_DATABASE_LIFECYCLES_PASS"); assert.equal(result.evidenceMode, "verified_existing_receipts"); assert.equal(result.databaseStateObservedNow, false); assert.equal(result.formalFinalRehearsalPairProduced, false); }
});
for (const defect of ["A-fails", "missing", "tamper", "code"]) test(`fail closed on ${defect}, no success summary or automatic retry`, async t => {
  const f = await fixture(t, defect), result = await runYuzhouRetainedBundlePair(f.input, f);
  assert.equal(result.status, "FAILED"); assert.deepEqual(f.calls, defect === "code" ? ["A", "B"] : ["A"]);
  assert.deepEqual(await readdir(f.input.outputDirectory), []);
});
for (const mode of ["--verify-existing", "--execute-isolated"]) test(`CLI rejects mismatched request mode before opening side configs: ${mode}`, async t => {
  const f = await fixture(t);
  const request = { ...f.input };
  // Invalid side paths make the request-stage failure distinguishable from reaching the runner.
  request.A = { path: "/nonexistent-synthetic-side-a.json", sha256: h("a") };
  request.B = { path: "/nonexistent-synthetic-side-b.json", sha256: h("b") };
  if (mode === "--execute-isolated") request.existingReceipts = {
    A: { receiptSha256: h("a-receipt"), manifestSha256: h("a-manifest") },
    B: { receiptSha256: h("b-receipt"), manifestSha256: h("b-manifest") },
  };
  const path = join(f.configs.A.stateRoot, "request.json"), bytes = Buffer.from(JSON.stringify(request));
  await writeFile(path, bytes, { mode: 0o600 });
  const cli = fileURLToPath(new URL("../hr-cutover/run-yuzhou-retained-bundle-pair.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cli, mode, "--request", path, "--request-sha256", h(bytes)], { encoding: "utf8", timeout: 10000, maxBuffer: 65536 });
  assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), { status: "FAILED", failureCode: "LAB_PAIR_REQUEST_FAILED", productionImport: "HOLD" });
  assert.deepEqual(await readdir(f.input.outputDirectory), []);
});
for (const [name, mutate] of [
  ["resource reuse", f => f.configs.B.resourceDescriptor.volume = f.configs.A.resourceDescriptor.volume],
  ["source mismatch", f => f.configs.B.pairMaterials.originalConfig = { ...f.configs.B.pairMaterials.originalConfig, sha256: h("other") }],
  ["run reuse", f => f.configs.B.artifacts.runId = f.configs.A.artifacts.runId],
  ["operation reuse", f => f.configs.B.artifacts.operationId = f.configs.A.artifacts.operationId],
  ["key reuse", f => f.configs.B.keyFiles = f.configs.A.keyFiles],
  ["executor mismatch", f => f.configs.B.artifacts.binding.executorSha256 = h("other")],
]) test(`reject ${name} before either run`, async t => { const f = await fixture(t); mutate(f); await f.save(); const result = await runYuzhouRetainedBundlePair(f.input, f); assert.equal(result.status, "FAILED"); assert.deepEqual(f.calls, []); });
