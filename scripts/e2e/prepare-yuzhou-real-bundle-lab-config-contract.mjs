import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { prepareYuzhouRealBundleLabConfig } from "../hr-cutover/prepare-yuzhou-real-bundle-lab-config.mjs";
import { LAB_EXECUTION_DEPENDENCIES, validateYuzhouLabConfig, parseYuzhouLabArgs } from "../hr-cutover/run-yuzhou-real-bundle-lab.mjs";
import { computeProductionImportPayloadBundleHash, computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL } from "../hr-cutover/production-import-target-model.mjs";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function setup(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "lab-config-prep-"))); t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, value) => { const path = join(root, name), bytes = Buffer.from(JSON.stringify(value, null, 2)); await writeFile(path, bytes, { mode: 0o600 }); return { path, sha256: hash(bytes) }; };
  const preparedRoot = join(root, "prepared"), stateRoot = join(root, "state"), outputDirectory = join(root, "output");
  for (const p of [preparedRoot, stateRoot, outputDirectory]) await mkdir(p, { mode: 0o700 });
  const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") };
  const scope = { tenantId: "synthetic", parkId: "synthetic" }; scope.scopeSha256 = computeProductionImportTargetScopeHash(scope);
  const summary = { status: "WRITER_INPUTS_PREPARED", triple, phases: [], databaseWrites: 0, productionImport: "HOLD" }, inputBytes = new Map();
  const phaseCounts = {};
  for (const [ordinal, phase] of ["T0", "T1", "T2", "T3"].entries()) {
    const row = { sourceIdentitySha256: hash(phase), sourceRowSha256: hash("row"), payloadSha256: hash("payload"), disposition: phase === "T3" ? "quarantine" : "insert" };
    const bundle = { phase, sourceBatchManifestSha256: hash("batch"), targetScope: scope, records: [row] };
    for (const [suffix, value] of [["payload", bundle], ["records", { phase, ordinal, sourceBatchManifestSha256: bundle.sourceBatchManifestSha256, records: [row] }]]) {
      const path = join(preparedRoot, `${phase.toLowerCase()}-${suffix}.json`), bytes = Buffer.from(JSON.stringify(value, null, 2));
      await writeFile(path, bytes, { mode: 0o600 }); inputBytes.set(path, bytes);
    }
    summary.phases.push({ phase, payloadBundleSha256: computeProductionImportPayloadBundleHash(bundle) });
    phaseCounts[phase] = { records: 1, inserted: phase === "T3" ? 0 : 1, quarantined: phase === "T3" ? 1 : 0 };
  }
  const summaryBytes = Buffer.from(JSON.stringify(summary)); await writeFile(join(preparedRoot, "summary.json"), summaryBytes, { mode: 0o600 }); inputBytes.set(join(preparedRoot, "summary.json"), summaryBytes);
  // Deliberately absent files prove preparation does not open key/envelope contents.
  const c = { formatVersion: 1, artifacts: { preparedRoot, expectedSummarySha256: hash(summaryBytes), expectedTriple: triple,
    binding: { codeSha: triple.codeSha, sourceSnapshotHash: triple.sourceSnapshotHash, mappingSha256: triple.mappingContractHash, executorSha256: hash("old-executor") },
    target: { database: "jinhu_hr_migration_lab_original" }, targetScope: scope, runId: "original-run", operationId: "yzprod-import-20260908T000000Z-aaaaaaaaaaaa",
    expectedCounts: { records: 4, inserted: 3, quarantined: 1 }, httpCounts: { employees: 1, contracts: 1, attendanceCalendars: 1, insurancePeriods: 1 } },
    stateRoot, container: "synthetic-lab", containerId: hash("container"), imageId: `sha256:${hash("image")}`, port: 15432,
    dependencies: { "historical-dependency.mjs": hash("historic") }, runtimeTreeSha256: hash("old-tree"),
    envelopes: { path: join(root, "unopened-envelopes.json"), sha256: hash("envelopes") }, keyFiles: [{ keyReferenceSha256: hash("key-reference"), keyFile: { path: join(root, "unopened-key"), sha256: hash("key-bytes") } }],
    baselineCounts: Object.fromEntries(Object.keys(MODEL.targetTables).map(t => [t, t === "sys_org" ? 14 : t === "hr_contract_type" ? 3 : 0])), phaseCounts };
  const existingConfig = await put("original.json", c), originalBytes = await readFile(existingConfig.path);
  await writeFile(join(stateRoot, "checkpoint-original-run.json"), "historical-apply-commit-intent", { mode: 0o600 });
  const input = { existingConfig, runId: "independent-run", targetDatabase: "jinhu_hr_migration_lab_independent", outputDirectory };
  const actual = { dependencies: Object.fromEntries(LAB_EXECUTION_DEPENDENCIES.map(p => [p, hash(p)])), runtimeTreeSha256: hash("current-tree"), executorSha256: hash("current-executor") };
  const options = { currentHead: () => "d".repeat(40), executionBinding: async () => actual };
  return { root, c, input, options, actual, put, inputBytes, originalBytes };
}

test("new config reuses all original files/AAD identity and is accepted by runner config/CLI parser", async t => {
  const f = await setup(t), result = await prepareYuzhouRealBundleLabConfig(f.input, f.options);
  assert.equal(result.status, "CONFIG_PREPARED"); assert.equal(result.labVerified, false); assert.equal(result.formalABVerified, false); assert.equal(result.keyContentsRead, false);
  const path = join(f.input.outputDirectory, "lab-config.json"), bytes = await readFile(path), c = JSON.parse(bytes);
  assert.equal(hash(bytes), result.configSha256); assert.equal(validateYuzhouLabConfig(c), c);
  for (const mode of ["--validate", "--preflight"]) assert.equal(parseYuzhouLabArgs([mode, "--config", path, "--config-sha256", result.configSha256]).mode, mode.slice(2));
  assert.equal(c.artifacts.runId, f.input.runId); assert.equal(c.artifacts.target.database, f.input.targetDatabase);
  assert.equal(c.artifacts.operationId, f.c.artifacts.operationId); assert.deepEqual(c.artifacts.expectedTriple, f.c.artifacts.expectedTriple);
  assert.deepEqual(c.artifacts.targetScope, f.c.artifacts.targetScope); assert.deepEqual(c.envelopes, f.c.envelopes); assert.deepEqual(c.keyFiles, f.c.keyFiles);
  assert.equal(c.artifacts.preparedRoot, f.c.artifacts.preparedRoot); assert.equal(c.stateRoot, f.c.stateRoot); assert.deepEqual(c.dependencies, f.actual.dependencies);
  assert.equal(c.artifacts.binding.codeSha, "a".repeat(40)); assert.equal(result.preparerCodeSha, "d".repeat(40));
  assert.equal(c.artifacts.binding.executorSha256, f.actual.executorSha256);
  for (const [path, original] of f.inputBytes) assert.deepEqual(await readFile(path), original);
  assert.deepEqual(await readFile(f.input.existingConfig.path), f.originalBytes);
  assert.equal(await readFile(join(f.c.stateRoot, "checkpoint-original-run.json"), "utf8"), "historical-apply-commit-intent");
  assert.deepEqual((await readdir(f.input.outputDirectory)).sort(), ["lab-config-preparation-receipt.json", "lab-config.json"]);
  assert.ok(!JSON.stringify(result).includes(f.root)); assert.ok(!JSON.stringify(result).includes("key-reference"));
});

for (const defect of ["same-run", "same-database", "production", "hash", "scope-override", "state-override", "lease", "checkpoint", "http", "final", "output-used", "input-public", "state-public", "output-symlink", "summary-tamper", "executor-drift", "head-drift", "baseline-counts", "scope-hash"]) test(`refuses ${defect} without success receipt`, async t => {
  const f = await setup(t);
  if (defect === "same-run") f.input.runId = f.c.artifacts.runId;
  if (defect === "same-database") f.input.targetDatabase = f.c.artifacts.target.database;
  if (defect === "production") f.input.targetDatabase = "jinhu_smart_park";
  if (defect === "hash") f.input.existingConfig.sha256 = hash("wrong");
  if (defect === "scope-override") f.input.scope = {};
  if (defect === "state-override") f.input.stateRoot = f.root;
  if (defect === "lease") await mkdir(join(f.c.stateRoot, "exclusive-owner"));
  if (["checkpoint", "http", "final"].includes(defect)) await writeFile(join(f.c.stateRoot, `${defect}-${f.input.runId}.json`), "retained");
  if (defect === "output-used") await writeFile(join(f.input.outputDirectory, "retained"), "old");
  if (defect === "input-public") await chmod(f.input.existingConfig.path, 0o644);
  if (defect === "state-public") await chmod(f.c.stateRoot, 0o755);
  if (defect === "output-symlink") { const link = join(f.root, "linked-output"); await symlink(f.input.outputDirectory, link); f.input.outputDirectory = link; }
  if (defect === "summary-tamper") await writeFile(join(f.c.artifacts.preparedRoot, "summary.json"), "{}");
  if (defect === "executor-drift") { let count = 0; f.options.executionBinding = async () => ({ ...f.actual, executorSha256: hash(String(count++)) }); }
  if (defect === "head-drift") { let count = 0; f.options.currentHead = () => (++count === 1 ? "d" : "e").repeat(40); }
  if (defect === "baseline-counts" || defect === "scope-hash") {
    if (defect === "baseline-counts") f.c.baselineCounts.sys_org = 0;
    else f.c.artifacts.targetScope.scopeSha256 = hash("wrong-scope");
    f.input.existingConfig = await f.put("invalid-config.json", f.c);
  }
  await assert.rejects(() => prepareYuzhouRealBundleLabConfig(f.input, f.options), e => /^LAB_CONFIG_PREPARATION_[A-Z_]+$/u.test(e.message) && !e.message.includes(f.root));
  assert.ok(!(await readdir(f.input.outputDirectory)).includes("lab-config-preparation-receipt.json"));
});
