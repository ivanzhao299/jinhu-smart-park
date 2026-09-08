import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseYuzhouLabArgs, validateYuzhouLabConfig, assertYuzhouLabContainer, assertYuzhouLabCapacity, runYuzhouLabCli, LAB_EXECUTION_DEPENDENCIES } from "../hr-cutover/run-yuzhou-real-bundle-lab.mjs";
const hash = "a".repeat(64);
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
