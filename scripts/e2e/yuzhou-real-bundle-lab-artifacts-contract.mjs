import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, chmod, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { computeProductionImportPayloadBundleHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { prepareYuzhouRealBundleLabArtifacts } from "../hr-cutover/yuzhou-real-bundle-lab-artifacts.mjs";
const hash = value => createHash("sha256").update(value).digest("hex");
async function fixture(fn) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "lab-artifact-contract-")));
  try {
    const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: "b".repeat(64), mappingContractHash: "c".repeat(64) }, scope = { tenantId: "fixture", parkId: "fixture", scopeSha256: "d".repeat(64) };
    const summary = { status: "WRITER_INPUTS_PREPARED", triple, phases: [], databaseWrites: 0, productionImport: "HOLD" };
    for (const [ordinal, phase] of ["T0", "T1", "T2", "T3"].entries()) {
      const row = { sourceIdentitySha256: hash(phase), sourceRowSha256: hash("row"), payloadSha256: hash("payload"), disposition: ordinal === 3 ? "quarantine" : "insert" };
      const payload = { phase, sourceBatchManifestSha256: hash("batch"), targetScope: scope, records: [row] }, raw = JSON.stringify(payload, null, 2);
      await writeFile(join(root, `${phase.toLowerCase()}-payload.json`), raw, { mode: 0o600 });
      await writeFile(join(root, `${phase.toLowerCase()}-records.json`), JSON.stringify({ phase, ordinal, sourceBatchManifestSha256: hash("batch"), records: [row] }), { mode: 0o600 });
      summary.phases.push({ phase, records: 1, payloadBundleSha256: computeProductionImportPayloadBundleHash(payload), payloadBytes: Buffer.byteLength(raw) });
    }
    const raw = JSON.stringify(summary); await writeFile(join(root, "summary.json"), raw, { mode: 0o600 });
    const input = { preparedRoot: root, expectedSummarySha256: hash(raw), expectedTriple: triple, binding: { codeSha: triple.codeSha, sourceSnapshotHash: triple.sourceSnapshotHash, mappingSha256: triple.mappingContractHash, executorSha256: "e".repeat(64) }, target: { database: "jinhu_hr_migration_lab_fixture" }, targetScope: scope, runId: "fixture-run", operationId: "yzprod-import-20260908T000000Z-aaaaaaaaaaaa", expectedCounts: { records: 4, inserted: 3, quarantined: 1 }, httpCounts: { employees: 1, contracts: 1, attendanceCalendars: 1, insurancePeriods: 1 } };
    await fn(input, root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
test("actual records shape and pretty JSON yield separate canonical and raw identities", () => fixture(async input => {
  for(const operationId of ["00000000-0000-4000-8000-000000000001","lab-run-invented","yzprod-import-20260908T000000Z-AAAA"])await assert.rejects(prepareYuzhouRealBundleLabArtifacts({...input,operationId}),/LAB_ARTIFACTS_INVALID/);
  const result = await prepareYuzhouRealBundleLabArtifacts(input), manifest = JSON.parse(result.manifestBytes);
  assert.equal(result.status, "ARTIFACTS_VERIFIED"); assert.equal(result.productionImport, "HOLD"); assert.equal(manifest.phases.length, 4);
  const raw = await result.readArtifact("T0:payload"); assert.equal(hash(raw), manifest.phases[0].payloadArtifact.sha256); assert.equal(hash(result.manifestBytes), result.manifestSha256);
  assert.equal(JSON.parse(await result.readArtifact("T0:records")).payloadBundleArtifactSha256, undefined);
  await assert.rejects(result.readArtifact("../summary.json"), /^Error: LAB_ARTIFACT_READ_DENIED$/);
}));
test("changed file after preparation cannot bypass descriptor hash", () => fixture(async (input, root) => {
  const result = await prepareYuzhouRealBundleLabArtifacts(input); await writeFile(join(root, "t3-payload.json"), "{}", { mode: 0o600 });
  await assert.rejects(result.readArtifact("T3:payload"), /^Error: LAB_ARTIFACT_READ_DENIED$/);
}));
test("historical hash-only summary derives counts and bytes without rewriting pinned history",()=>fixture(async(input,root)=>{
 const path=join(root,"summary.json"),summary=JSON.parse(await readFile(path,"utf8"));
 summary.phases=summary.phases.map(({phase,payloadBundleSha256})=>({phase,payloadBundleSha256}));
 const raw=JSON.stringify(summary);await writeFile(path,raw);input.expectedSummarySha256=hash(raw);
 const result=await prepareYuzhouRealBundleLabArtifacts(input);
 assert.equal(result.status,"ARTIFACTS_VERIFIED");assert.equal(await readFile(path,"utf8"),raw);
 await assert.rejects(prepareYuzhouRealBundleLabArtifacts({...input,expectedCounts:{records:5,inserted:4,quarantined:1}}),/LAB_ARTIFACTS_INVALID/);
 summary.phases[0].payloadBundleSha256="f".repeat(64);const bad=JSON.stringify(summary);await writeFile(path,bad);
 await assert.rejects(prepareYuzhouRealBundleLabArtifacts({...input,expectedSummarySha256:hash(bad)}),/LAB_ARTIFACTS_INVALID/);
}));
test("explicit false measurements, partial and unknown summary shapes reject",()=>fixture(async(input,root)=>{
 const path=join(root,"summary.json"),original=await readFile(path,"utf8");
 for(const mutate of [p=>{p.records=2;},p=>{p.payloadBytes++;},p=>{delete p.records;},p=>{delete p.payloadBytes;},p=>{p.extra=true;}]){
  const summary=JSON.parse(original);mutate(summary.phases[0]);const raw=JSON.stringify(summary);await writeFile(path,raw);
  await assert.rejects(prepareYuzhouRealBundleLabArtifacts({...input,expectedSummarySha256:hash(raw)}),/LAB_ARTIFACTS_INVALID/);
 }
}));
test("summary, scope, counts, execution triple and payload tampering fail closed", () => fixture(async (input, root) => {
  for (const changed of [{ ...input, expectedSummarySha256: "f".repeat(64) }, { ...input, targetScope: { ...input.targetScope, parkId: "foreign" } }, { ...input, expectedCounts: { records: 4, inserted: 4, quarantined: 0 } }, { ...input, binding: { ...input.binding, codeSha: "f".repeat(40) } }]) await assert.rejects(prepareYuzhouRealBundleLabArtifacts(changed), /^Error: LAB_ARTIFACTS_INVALID$/);
  const path = join(root, "t3-payload.json"), text = await readFile(path, "utf8"); await writeFile(path, text.replace("fixture", "changed"));
  await assert.rejects(prepareYuzhouRealBundleLabArtifacts(input), /^Error: LAB_ARTIFACTS_INVALID$/);
}));
test("nonprivate files and symlinks are rejected without exposing paths", () => fixture(async (input, root) => {
  const path = join(root, "t0-payload.json"); await chmod(path, 0o644); await assert.rejects(prepareYuzhouRealBundleLabArtifacts(input), /^Error: LAB_ARTIFACTS_INVALID$/);
  await chmod(path, 0o600); await rm(path); await symlink(join(root, "t1-payload.json"), path);
  await assert.rejects(prepareYuzhouRealBundleLabArtifacts(input), /^Error: LAB_ARTIFACTS_INVALID$/);
}));
test("root privacy, canonical paths, file bounds and records provenance are enforced", () => fixture(async (input, root) => {
  await chmod(root, 0o755); await assert.rejects(prepareYuzhouRealBundleLabArtifacts(input), /LAB_ARTIFACTS_INVALID/); await chmod(root, 0o700);
  await assert.rejects(prepareYuzhouRealBundleLabArtifacts({ ...input, preparedRoot: `${root}/../${root.split("/").at(-1)}` }), /LAB_ARTIFACTS_INVALID/);
  const path = join(root, "t0-records.json"), value = JSON.parse(await readFile(path, "utf8")); value.records[0].sourceRowSha256 = "f".repeat(64); await writeFile(path, JSON.stringify(value));
  await assert.rejects(prepareYuzhouRealBundleLabArtifacts(input), /LAB_ARTIFACTS_INVALID/);
  await writeFile(path, " ".repeat(1025)); await assert.rejects(prepareYuzhouRealBundleLabArtifacts({ ...input, maxFileBytes: 1024 }), /LAB_ARTIFACTS_INVALID/);
}));
