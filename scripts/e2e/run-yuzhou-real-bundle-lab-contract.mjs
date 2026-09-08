import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile, chmod, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseYuzhouLabArgs, validateYuzhouLabConfig, assertYuzhouLabContainer, assertYuzhouLabCapacity, runYuzhouLabCli, LAB_EXECUTION_DEPENDENCIES, persistYuzhouLabFinalReceipt, readYuzhouLabFinalReceipt } from "../hr-cutover/run-yuzhou-real-bundle-lab.mjs";
const hash = "a".repeat(64);
const receiptId = () => ({ runId: "receipt-contract", configSha256: hash, manifestSha256: hash, binding: { codeSha: "a".repeat(40), sourceSnapshotHash: hash, mappingSha256: hash, executorSha256: hash } });
test("durable final receipt reloads exact safe identity and never overwrites or proves DB independently", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "lab-final-contract-")));
  try {
    const identity = receiptId(), result = { status: "LAB_PASS", counts: { records: 3, inserted: 2, quarantined: 1 }, httpVerified: true, rollbackVerified: true, residualVerified: true, failureCodes: [], productionImport: "HOLD", rawSecret: "excluded-private-value" };
    const saved = await persistYuzhouLabFinalReceipt({ stateRoot: root, identity, result });
    assert.equal(saved.finalReceiptPersisted, true);
    const loaded = await readYuzhouLabFinalReceipt({ stateRoot: root, identity });
    assert.equal(loaded.receiptSha256, saved.finalReceiptSha256); assert.equal(loaded.databaseStateIndependentlyVerified, false);
    const bytes = await readFile(join(root, `final-${identity.runId}.json`), "utf8");
    assert.ok(!bytes.includes(root)); assert.ok(!bytes.includes("excluded-private-value"));
    await assert.rejects(persistYuzhouLabFinalReceipt({ stateRoot: root, identity, result }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
    assert.equal(await readFile(join(root, `final-${identity.runId}.json`), "utf8"), bytes);
    await assert.rejects(readYuzhouLabFinalReceipt({ stateRoot: root, identity: { ...identity, configSha256: "b".repeat(64) } }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
    await writeFile(join(root, `final-${identity.runId}.json`), bytes.replace('"inserted":2', '"inserted":1'));
    await assert.rejects(readYuzhouLabFinalReceipt({ stateRoot: root, identity }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("failure receipts preserve safe codes; invalid success, paths and symlink targets fail closed", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "lab-final-contract-")));
  try {
    const identity = receiptId(), failed = { status: "FAILED", failureCodes: ["LAB_OWNER_APPLY_FAILED", "SQLSTATE_23514", "PRODUCTION_IMPORT_PAYLOAD_INVALID", "LAB_IMPORT_SCOPE_INVALID", "LAB_ROLLBACK_MAP_INVALID"], productionImport: "HOLD" };
    await assert.rejects(persistYuzhouLabFinalReceipt({ stateRoot: root, identity, result: { ...failed, status: "LAB_PASS" } }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
    for (const code of ["/private/error", "SQLSTATE_23514 detail=private", "SQLSTATE_235140", "PRODUCTION_IMPORT_private", `LAB_ROLLBACK_${"A".repeat(97)}`, "OTHER_ERROR"]) {
      await assert.rejects(persistYuzhouLabFinalReceipt({ stateRoot: root, identity, result: { ...failed, failureCodes: [code] } }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
    }
    await chmod(root, 0o755);
    await assert.rejects(persistYuzhouLabFinalReceipt({ stateRoot: root, identity, result: failed }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
    await chmod(root, 0o700);
    await persistYuzhouLabFinalReceipt({ stateRoot: root, identity, result: failed });
    assert.deepEqual((await readYuzhouLabFinalReceipt({ stateRoot: root, identity })).result.failureCodes, failed.failureCodes);
    const other = { ...identity, runId: "other-contract" };
    await symlink(join(root, `final-${identity.runId}.json`), join(root, `final-${other.runId}.json`));
    await assert.rejects(persistYuzhouLabFinalReceipt({ stateRoot: root, identity: other, result: failed }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
    await assert.rejects(readYuzhouLabFinalReceipt({ stateRoot: root, identity: other }), /LAB_CLI_FINAL_RECEIPT_FAILED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
const invalidOperations = ["00000000-0000-4000-8000-000000000001", "yzprod-import-20260908T000000Z-AAAA", "lab-run-invented"];
const config = () => ({ formatVersion: 1, artifacts: { preparedRoot: "/private/not-read", expectedSummarySha256: hash, expectedTriple: { codeSha: "a".repeat(40), sourceSnapshotHash: hash, mappingContractHash: hash }, binding: { codeSha: "a".repeat(40), sourceSnapshotHash: hash, mappingSha256: hash, executorSha256: hash }, target: { database: "jinhu_hr_migration_lab_contract" }, targetScope: {}, runId: "contract", operationId: "yzprod-import-20260908T000000Z-aaaaaaaaaaaa", expectedCounts: {}, httpCounts: {} }, stateRoot: "/private/not-read", container: "lab", containerId: hash, imageId: `sha256:${hash}`, port: 15432, dependencies: Object.fromEntries(LAB_EXECUTION_DEPENDENCIES.map(p => [p, hash])), runtimeTreeSha256: hash, envelopes: { path: "/private/not-read", sha256: hash }, keyFiles: [], baselineCounts: {}, phaseCounts: {} });
test("exact explicit modes; no production, implicit execute, or unknown args", () => {
  for (const mode of ["validate", "preflight", "execute-isolated"]) assert.equal(parseYuzhouLabArgs([`--${mode}`, "--config", "/fixture", "--config-sha256", hash]).mode, mode);
  for (const args of [[], ["--execute"], ["--production", "--config", "/fixture", "--config-sha256", hash]]) assert.throws(() => parseYuzhouLabArgs(args), /LAB_CLI_GUARD/);
});
test("configuration pins complete dependency set and rejects production target or extras", () => {
  for (const operationId of invalidOperations) { const c=config();c.artifacts.operationId=operationId;assert.throws(()=>validateYuzhouLabConfig(c),/LAB_CLI_GUARD/); }
  assert.equal(validateYuzhouLabConfig(config()).formatVersion, 1);
  for (const mutate of [c => { c.artifacts.target.database = "jinhu"; }, c => { c.dependencies.extra = hash; }, c => { delete c.dependencies[LAB_EXECUTION_DEPENDENCIES[0]]; }, c => { c.password = "never log me"; }, c => { c.port = 0; }]) { const c = config(); mutate(c); assert.throws(() => validateYuzhouLabConfig(c), /LAB_CLI_GUARD/); }
});
test("container requires exact running ID/image/project and single loopback port", () => {
  const c = config(), good = () => ({ Id: hash, Image: c.imageId, State: { Running: true }, Config: { Labels: { "com.docker.compose.project": "jinhu_hr_migration_lab" } }, NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "15432" }] } } });
  assert.doesNotThrow(() => assertYuzhouLabContainer(c, good()));
  for (const mutate of [d => { d.Id = "b".repeat(64); }, d => { d.Image = "wrong"; }, d => { d.State.Running = false; }, d => { d.NetworkSettings.Ports["5432/tcp"][0].HostIp = "0.0.0.0"; }, d => { d.Config.Labels = {}; }]) { const d = good(); mutate(d); assert.throws(() => assertYuzhouLabContainer(c, d), /LAB_CLI_GUARD/); }
});
test("private config byte mismatch fails before any DB and reports no path/body", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lab-cli-contract-"));
  try { const path = join(dir, "config.json"), bytes = JSON.stringify({ secret: "do-not-report" }); await writeFile(path, bytes, { mode: 0o600 });
    const result = await runYuzhouLabCli({ mode: "validate", configPath: path, configSha256: hash });
    assert.deepEqual(result.failureCodes, ["LAB_CLI_CONFIG_FAILED"]); assert.equal(result.productionImport, "HOLD");
    assert.ok(!JSON.stringify(result).includes(dir)); assert.ok(!JSON.stringify(result).includes("do-not-report"));
    const pinned = await runYuzhouLabCli({ mode: "validate", configPath: path, configSha256: createHash("sha256").update(bytes).digest("hex") }); assert.equal(pinned.status, "FAILED");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("invalid CLI paths fail actual entrypoint before private reads", async () => {
 for (const configPath of ["relative.json", "/tmp/../private", "/tmp/invalid\0path"]) {
  assert.throws(()=>parseYuzhouLabArgs(["--validate","--config",configPath,"--config-sha256",hash]),/LAB_CLI_GUARD/);
  assert.deepEqual((await runYuzhouLabCli({mode:"validate",configPath,configSha256:hash})).failureCodes,["LAB_CLI_CONFIG_FAILED"]);
 }
 for(const mutate of [c=>{c.stateRoot="relative";},c=>{c.envelopes.path="relative";},c=>{c.artifacts.preparedRoot="relative";}]){const c=config();mutate(c);assert.throws(()=>validateYuzhouLabConfig(c),/LAB_CLI_GUARD/);}
});
test("capacity uses existing reserve plus actual PG size instead of a fixed new threshold",()=>{
 const used=1024**2,free=15*1024**2,host=22*1024**3;
 assert.doesNotThrow(()=>assertYuzhouLabCapacity(host,free,used));
 for(const args of [[host-1,free,used],[host,free-1,used],[host,free,NaN]])assert.throws(()=>assertYuzhouLabCapacity(...args),/LAB_CLI_GUARD/);
});
