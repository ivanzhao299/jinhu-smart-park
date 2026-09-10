/* global AbortController: readonly */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistYuzhouLabFinalReceipt, readYuzhouLabFinalReceipt } from "../hr-cutover/run-yuzhou-real-bundle-lab.mjs";
import { runYuzhouRealBundleLabOwner } from "../hr-cutover/yuzhou-real-bundle-lab-owner.mjs";
import { computeProductionImportPayloadHash, computeProductionImportPayloadBundleHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { ProductionImportExecutionError } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = value => Buffer.from(JSON.stringify(value));
function fixture(options = {}) {
  const trace = [], files = new Map();
  const scope = { tenantId: "fixture", parkId: "fixture", scopeSha256: "a".repeat(64) };
  const manifest = { binding: { codeSha: "a".repeat(40), sourceSnapshotHash: "b".repeat(64), mappingSha256: "c".repeat(64), executorSha256: "d".repeat(64) },
    target: { database: "jinhu_hr_migration_lab_fixture" }, targetScope: scope, runId: "fixture-owner", operationId: "yzprod-import-20260908T000000Z-aaaaaaaaaaaa",
    expectedCounts: { records: 4, inserted: 3, quarantined: 1 }, httpCounts: { employees: 1, contracts: 1, attendanceCalendars: 1, insurancePeriods: 1 }, phases: [] };
  for (const phase of ["T0", "T1", "T2", "T3"]) {
    const records = [{ disposition: phase === "T3" ? "quarantine" : "insert", sourceIdentitySha256: sha(phase) }];
    const bundle = { phase, sourceBatchManifestSha256: sha(phase), canonicalizationVersion: "v1", targetScope: options.reordered ? { scopeSha256: scope.scopeSha256, parkId: scope.parkId, tenantId: scope.tenantId } : scope, records };
    const payload = Buffer.from(JSON.stringify(bundle, null, options.pretty ? 2 : undefined)); files.set(`${phase}-payload`, payload);
    const plan = bytes({ phase, ordinal: ["T0", "T1", "T2", "T3"].indexOf(phase), sourceBatchManifestSha256: options.sourceBatchDrift ? sha("drift") : sha(phase), records,
      ...(options.rawProducer ? {} : { payloadBundleArtifactSha256: computeProductionImportPayloadHash(bundle), payloadBundleSha256: computeProductionImportPayloadBundleHash(bundle) }) }); files.set(`${phase}-plan`, plan);
    manifest.phases.push({ phase, phaseArtifact: { ref: `${phase}-plan`, sha256: sha(plan) }, payloadArtifact: { ref: `${phase}-payload`, sha256: sha(payload) } });
  }
  let commits = 0;
  const client = { async query(sql) {
    trace.push(sql);
    if (sql.includes("current_database")) return { rows: [{ database_name: options.wrongDatabase ? "production" : manifest.target.database }] };
    if (sql.includes("pg_try_advisory_lock")) { if (options.lockLost) throw new Error("private lock connection"); return { rows: [{ locked: !options.locked }] }; }
    if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: !options.unlockFails }] };
    if (sql === "COMMIT" && ((++commits === 1 && options.commitLost) || (commits === 2 && options.reverseCommitLost))) throw new Error("private commit connection");
    if (sql === "ROLLBACK" && options.rollbackFails) throw new Error("private rollback");
    return { rows: [] };
  }, release(error) { trace.push(error ? "release-destroy" : "release"); } };
  const adapters = {
    acquireExclusiveOwner: async () => options.ownerBusy ? null : { release: async () => !options.leaseReleaseFails },
    verifyBinding: async () => ({ binding: options.bindingDrift ? {} : Object.fromEntries(Object.entries(manifest.binding).reverse()), capacityReady: true }),
    captureBaseline: async () => ({ emptyWritableSlice: true, activeRunCount: 0, scopeOwnedAndActive: !options.foreignScope, otherWriters: 0 }),
    checkpoint: async () => { trace.push("checkpoint"); return !options.checkpointFails; },
    createWriters: () => Object.fromEntries(["T0", "T1", "T2", "T3"].map(phase => [phase, async input => { trace.push(`apply:${phase}`); assert.equal(input.phase.payloadBundleArtifactSha256, computeProductionImportPayloadHash(input.payloadBundle)); assert.equal(input.phase.payloadBundleSha256, computeProductionImportPayloadBundleHash(input.payloadBundle)); if (phase === options.applyFails) throw new Error("PII source row"); return { records: input.phase.records }; }])),
    createRollback: () => async ({ phase }) => { trace.push(`reverse:${phase}`); if (options.reverseFails) throw new Error("PII rollback row"); },
    verifyHttp: async () => { trace.push("http"); if (options.httpFails) throw new Error("password secret"); if(options.httpFailure)return {status:"FAILED",failure:options.httpFailure}; return { status: "PASS", fixtureCleanup: options.fixtureLeak ? "FAILED" : "PASS", fullAppModule: true, productionImport: "HOLD",
      verification: { status: "CONTRACT_PASS", productionImport: "HOLD", observedCounts: options.httpCountDrift ? {} : Object.fromEntries(Object.entries(manifest.httpCounts).reverse()) } }; },
    resolveApplyState: async () => { trace.push("resolve"); return options.unknownCommit ? "unknown" : "applied"; },
    verifyResidual: async () => { trace.push("residual"); return { baselineRestored: !options.residualFails, activeRunMaps: 0, businessResidualRows: 0, httpFixtureResidualRows: 0 }; },
  };
  const input = { manifestBytes: bytes(manifest), manifestSha256: sha(bytes(manifest)), readArtifact: async ref => { trace.push(`read:${ref}`); return options.hashDrift && ref === "T3-payload" ? bytes({ drift: true }) : files.get(ref); },
    pool: { options: { host: "127.0.0.1", database: manifest.target.database }, connect: async () => { trace.push("connect"); return client; } }, adapters };
  return { input, trace };
}
test("all eight hashes precede connection; serializable apply/HTTP/reverse/residual is aggregate contract evidence", async () => {
  const { input, trace } = fixture(); const result = await runYuzhouRealBundleLabOwner(input);
  assert.equal(result.status, "CONTRACT_PASS"); assert.equal(result.productionImport, "HOLD"); assert.equal(result.httpVerified, false); assert.equal(result.rollbackVerified, true);
  assert.equal(trace.slice(0, 8).every(value => value.startsWith("read:")), true);
  assert.deepEqual(trace.filter(value => value.startsWith("apply:")), ["apply:T0", "apply:T1", "apply:T2", "apply:T3"]);
  assert.deepEqual(trace.filter(value => value.startsWith("reverse:")), ["reverse:T3", "reverse:T2", "reverse:T1", "reverse:T0"]);
  assert.equal(trace.filter(value => value === "BEGIN ISOLATION LEVEL SERIALIZABLE").length, 2);
  assert.ok(trace.indexOf("checkpoint") < trace.indexOf("COMMIT")); assert.ok(trace.indexOf("http") > trace.indexOf("COMMIT"));
  assert.equal(trace.at(-1), "release"); assert.ok(!JSON.stringify(result).includes("fixture-owner"));
});
test("HTTP failure classifications survive owner reversal and final receipt readback without raw diagnostics",async()=>{
 const failure={step:"verify",errorType:"Error",code:"HR_HTTP_PROBE_TIMEOUT",sqlState:null,requestStep:"insurancePeriods_page1",insuranceTimings:[{stage:"items",status:"pending",elapsedMs:14900}]};
 const {input}=fixture({httpFailure:failure}),result=await runYuzhouRealBundleLabOwner(input);
 assert.equal(result.status,"FAILED");assert.deepEqual(result.httpFailure,failure);assert.equal(result.rollbackVerified,true);assert.equal(result.residualVerified,true);
 const stateRoot=await realpath(await mkdtemp(join(tmpdir(),"owner-http-step-")));
 try {
  const identity={runId:"owner-http-step",configSha256:sha("config"),manifestSha256:input.manifestSha256,binding:JSON.parse(input.manifestBytes).binding};
  await persistYuzhouLabFinalReceipt({stateRoot,identity,result});
  assert.deepEqual((await readYuzhouLabFinalReceipt({stateRoot,identity})).result.httpFailure,failure);
 } finally { await rm(stateRoot,{recursive:true,force:true}); }
 const malicious={step:"PRIVATE_STEP",errorType:"PRIVATE_TYPE",code:"HR_HTTP_PRIVATE_PAYLOAD",sqlState:"private",message:"PRIVATE_BODY",requestStep:"/hr/contracts/PRIVATE_ID"};
 const rejected=await runYuzhouRealBundleLabOwner(fixture({httpFailure:malicious}).input);
 assert.deepEqual(rejected.httpFailure,{step:"unknown",errorType:"Error",code:null,sqlState:null});assert.ok(!JSON.stringify(rejected).includes("PRIVATE"));
});
test("pretty artifact bytes remain independently pinned while canonical identity ignores object key order", async () => {
  const { input } = fixture({ pretty: true, reordered: true });
  assert.equal((await runYuzhouRealBundleLabOwner(input)).status, "CONTRACT_PASS");
});
test("owner rejects UUID or malformed operation IDs before reading artifacts",async()=>{
 for(const operationId of ["00000000-0000-4000-8000-000000000001","lab-run-invented","yzprod-import-20260908T000000Z-AAAA"]){
  const {input,trace}=fixture();const manifest=JSON.parse(input.manifestBytes);manifest.operationId=operationId;input.manifestBytes=bytes(manifest);input.manifestSha256=sha(input.manifestBytes);
  assert.equal((await runYuzhouRealBundleLabOwner(input)).status,"FAILED");assert.deepEqual(trace,[]);
 }
});
test("existing raw records producer shape receives canonical bundle binding without rewriting artifacts", async () => {
  const { input } = fixture({ rawProducer: true, pretty: true });
  const original = Buffer.from(await input.readArtifact("T0-plan"));
  assert.deepEqual(Object.keys(JSON.parse(original)), ["phase", "ordinal", "sourceBatchManifestSha256", "records"]);
  assert.equal((await runYuzhouRealBundleLabOwner(input)).status, "CONTRACT_PASS");
  assert.deepEqual(await input.readArtifact("T0-plan"), original);
});
for (const option of ["hashDrift", "sourceBatchDrift", "bindingDrift", "ownerBusy", "wrongDatabase", "locked", "foreignScope"]) test(`${option} fails before business writes`, async () => {
  const { input, trace } = fixture({ [option]: true }); const result = await runYuzhouRealBundleLabOwner(input);
  assert.equal(result.status, "FAILED"); assert.equal(trace.some(value => value.startsWith("apply:")), false);
});
test("phase and checkpoint failures SQL-rollback before HTTP with no raw errors", async () => {
  for (const option of [{ applyFails: "T2" }, { checkpointFails: true }]) {
    const { input, trace } = fixture(option); const result = await runYuzhouRealBundleLabOwner(input);
    assert.equal(result.status, "FAILED"); assert.ok(trace.includes("ROLLBACK")); assert.ok(!trace.includes("COMMIT")); assert.ok(!trace.includes("http")); assert.ok(!JSON.stringify(result).includes("PII"));
  }
});
for (const option of ["httpFails", "fixtureLeak", "httpCountDrift"]) test(`${option} still reverses committed phases`, async () => {
  const { input, trace } = fixture({ [option]: true }); const result = await runYuzhouRealBundleLabOwner(input);
  assert.equal(result.status, "FAILED"); assert.equal(result.rollbackVerified, true); assert.ok(trace.includes("reverse:T0"));
});
test("lost commit resolves exact ledger state before reverse; unknown state never claims clean pass", async () => {
  const { input, trace } = fixture({ commitLost: true }); const result = await runYuzhouRealBundleLabOwner(input);
  assert.equal(result.status, "FAILED"); assert.ok(trace.indexOf("resolve") < trace.indexOf("reverse:T3")); assert.equal(result.rollbackVerified, true);
  const unknown = fixture({ commitLost: true, unknownCommit: true }); const failed = await runYuzhouRealBundleLabOwner(unknown.input);
  assert.equal(failed.status, "FAILED"); assert.equal(failed.rollbackVerified, false); assert.ok(failed.failureCodes.includes("LAB_OWNER_RECOVERY_FAILED"));
});
test("reverse, SQL rollback and residual failures remain failures and release unsafe clients", async () => {
  for (const option of [{ reverseFails: true }, { applyFails: "T1", rollbackFails: true }, { residualFails: true }]) {
    const { input, trace } = fixture(option); const result = await runYuzhouRealBundleLabOwner(input); assert.equal(result.status, "FAILED");
    if (option.rollbackFails) assert.equal(trace.at(-1), "release-destroy");
  }
});
test("real mode refuses injected business executors; cancellation before write is fail closed", async () => {
  const { input, trace } = fixture(); assert.equal((await runYuzhouRealBundleLabOwner({ ...input, mode: "real" })).status, "FAILED"); assert.deepEqual(trace, []);
  const controller = new AbortController(); controller.abort(); assert.equal((await runYuzhouRealBundleLabOwner({ ...input, signal: controller.signal })).status, "FAILED");
});
test("unproven advisory lock release destroys the pooled session", async () => {
  for (const options of [{ lockLost: true }, { unlockFails: true }]) {
    const { input, trace } = fixture(options);
    const result = await runYuzhouRealBundleLabOwner(input);
    assert.equal(result.status, "FAILED");
    assert.equal(trace.at(-1), "release-destroy");
    if (options.lockLost) assert.ok(!trace.some(value => value.startsWith("apply:")));
    assert.ok(!JSON.stringify(result).includes("private"));
  }
});
test("reverse COMMIT ambiguity resolves ledger before retry and never claims overall success", async () => {
  const { input, trace } = fixture({ reverseCommitLost: true });
  const result = await runYuzhouRealBundleLabOwner(input);
  assert.equal(result.status, "FAILED");
  assert.equal(result.rollbackVerified, true);
  const resolve = trace.indexOf("resolve");
  assert.ok(resolve > trace.indexOf("reverse:T0"));
  assert.equal(trace.filter(value => value === "reverse:T3").length, 2);
  assert.ok(trace.indexOf("reverse:T3", resolve) > resolve);
});
test("owner lease cleanup failure cannot produce success after clean reversal", async () => {
  const { input } = fixture({ leaseReleaseFails: true });
  const result = await runYuzhouRealBundleLabOwner(input);
  assert.equal(result.status, "FAILED");
  assert.ok(result.failureCodes.includes("LAB_OWNER_LEASE_RELEASE_FAILED"));
});
test("writer diagnostics retain only bounded stable codes alongside stage",async()=>{
 for(const code of ["PRODUCTION_IMPORT_PAYLOAD_BUNDLE_BINDING_MISMATCH","LAB_IMPORT_SCOPE_DENIED","LAB_ROLLBACK_BATCH_MISMATCH","23505"]){
  const {input}=fixture();input.adapters.createWriters=()=>({T0:async()=>{throw new ProductionImportExecutionError(code,"PRIVATE payload SQL password");}});
  const result=await runYuzhouRealBundleLabOwner(input);
  assert.ok(result.failureCodes.includes("LAB_OWNER_APPLY_FAILED"));
  assert.ok(result.failureCodes.includes(code==="23505"?"SQLSTATE_23505":code));
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|password|payload SQL/);
 }
});
test("unknown, oversized and accessor error codes never leak or interrupt cleanup",async()=>{
 for(const error of [{code:"PRIVATE_SECRET"},{code:"LAB_IMPORT_"+"A".repeat(97)},{get code(){throw new Error("PRIVATE getter");}},null]){
  const {input,trace}=fixture();input.adapters.createWriters=()=>({T0:async()=>{throw error;}});
  const result=await runYuzhouRealBundleLabOwner(input);
  assert.deepEqual(result.failureCodes,["LAB_OWNER_APPLY_FAILED"]);
  assert.ok(trace.includes("ROLLBACK"));assert.ok(trace.includes("residual"));
 }
});
