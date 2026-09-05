import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { buildProductionT2ChangeClassifications as build, materializeProductionT2ChangeClassifications as materialize, verifyT2RenewalRoutineBytes, T2_RENEWAL_ROUTINE_ID, T2_RENEWAL_ROUTINE_SHA256 } from "../hr-cutover/materialize-production-t2-change-classifications.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: hash("source"), mappingContractHash: hash("mapping") };
const routineEvidence = { routineId: "RULE-F089F24164D89466", routineSha256: "f1cc43ab459f8808198bb11ee5834231282546e88656eb16360f4f6535cf2c12" };
function row(sourceTable, source) {
  const sourceKey = sourceTable === "dbo.compact" ? source.contractNo.trim() : sourceTable === "dbo.compacttypecode" ? source.typeCode.trim()
    : [source.contractNo, source.employeeCode, source.startDate, source.endDate, source.signedAt].map(v => String(v ?? "").trim()).join("|");
  return { sourceTable, sourceKey, source, sourceIdentitySha256: hash(`${sourceTable}\0${sourceKey}`), sourceRowSha256: hash(JSON.stringify(source, Object.keys(source).sort())) };
}
const contract = (id = "SYN-C", employee = "SYN-E") => row("dbo.compact", { contractNo: id, employeeCode: employee });
const change = (id = "SYN-C", employee = "SYN-E", start = "2025-01-01 00:00:00") => row("dbo.compact_c", { contractNo: id, employeeCode: employee, startDate: start, endDate: null, signedAt: null, sequenceNo: 1 });
const input = (stagedRecords = [contract(), change()]) => ({ triple: structuredClone(triple), stagedRecords, stageFileSha256: hash("bound change bytes"), routineEvidence: { ...routineEvidence } });
const stableFailure = fn => assert.throws(fn, error => typeof error.code === "string" && error.message === error.code && !error.message.includes("SYN-"));

test("exact source-linked renewal emits existing consumer envelope and no business fields", () => {
  assert.equal(T2_RENEWAL_ROUTINE_ID, routineEvidence.routineId); assert.equal(T2_RENEWAL_ROUTINE_SHA256, routineEvidence.routineSha256);
  const i = input(), before = structuredClone(i), { artifact } = build(i);
  assert.deepEqual(Object.keys(artifact).sort(), ["formatVersion", "kind", "triple", "stageFileSha256", "records", "productionImport"].sort());
  assert.equal(artifact.kind, "yuzhou_hr_t2_change_classification_candidates");
  assert.equal(artifact.productionImport, "HOLD"); assert.deepEqual(artifact.triple, triple);
  assert.deepEqual(artifact.records, [{ sourceIdentitySha256: i.stagedRecords[1].sourceIdentitySha256, sourceRowSha256: i.stagedRecords[1].sourceRowSha256, changeType: "renewal", evidenceSha256: routineEvidence.routineSha256 }]);
  assert.equal(JSON.stringify(artifact).includes("SYN-"), false); assert.deepEqual(i, before);
  artifact.records[0].changeType = "amendment"; assert.deepEqual(i, before);
});
test("missing parent and employee mismatch remain counted needs_review, never renewal", () => {
  const { artifact, summary } = build(input([contract(), change("SYN-ORPHAN"), change("SYN-C", "SYN-OTHER")]));
  assert.equal(artifact.records.length, 2); assert.ok(artifact.records.every(r => r.changeType === "needs_review"));
  assert.deepEqual(summary, { totalChanges: 2, renewal: 0, needsReview: 2, reasonCounts: { MISSING_PARENT: 1, AMBIGUOUS_PARENT: 0, EMPLOYEE_MISMATCH: 1 }, productionImport: "HOLD" });
});
test("routine evidence checks actual bytes and cannot accept a caller's claimed hash", () => {
  for (const bytes of [Buffer.from("SELECT 1;"), Buffer.alloc(0), Buffer.alloc(256 * 1024 + 1), routineEvidence]) stableFailure(() => verifyT2RenewalRoutineBytes(bytes));
});
test("private config permission, links and allocation bounds reject before source access", t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hr-t2-classification-safety-"))); chmodSync(dir, 0o700);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = name => { const path = join(dir, name); writeFileSync(path, "{}\n", { mode: 0o600 }); return path; };
  const unsafe = write("unsafe.json"); chmodSync(unsafe, 0o644); assert.throws(() => materialize(unsafe), { code: "T2_CHANGE_CLASSIFICATION_FILE_UNSAFE" });
  const original = write("original.json"), sym = join(dir, "symlink.json"); symlinkSync(original, sym); assert.throws(() => materialize(sym), { code: "T2_CHANGE_CLASSIFICATION_FILE_UNSAFE" });
  linkSync(original, join(dir, "hardlink.json")); assert.throws(() => materialize(original), { code: "T2_CHANGE_CLASSIFICATION_FILE_UNSAFE" });
  const large = write("large.json"); truncateSync(large, 32 * 1024 ** 2 + 1); assert.throws(() => materialize(large), { code: "T2_CHANGE_CLASSIFICATION_FILE_UNSAFE" });
  const small = write("small.json"); assert.throws(() => materialize(small, { maximumReadBytes: 1 }), { code: "T2_CHANGE_CLASSIFICATION_FILE_UNSAFE" });
  assert.throws(() => materialize(small, { maximumReadBytes: 128 * 1024 ** 2 + 1 }), { code: "T2_CHANGE_CLASSIFICATION_READ_BUDGET_INVALID" });
});
test("source order is irrelevant, every change is conserved and zero is valid", () => {
  const rows = [contract(), change(), change("SYN-ORPHAN")];
  assert.deepEqual(build(input(rows)), build(input([...rows].reverse())));
  assert.equal(build(input([])).artifact.records.length, 0);
  assert.equal(build(input([contract()])).artifact.records.length, 0);
});
test("different or extra routine evidence cannot silently become renewal authority", () => {
  for (const mutate of [i => { i.routineEvidence.routineSha256 = hash("other"); }, i => { i.routineEvidence.routineId = "RULE-OTHER"; }, i => { i.routineEvidence.approved = true; }]) {
    const i = input(); mutate(i); stableFailure(() => build(i));
  }
});
test("malformed triple, stage hash, unknown source field and row-hash drift fail closed", () => {
  for (const mutate of [i => { i.triple.codeSha = "bad"; }, i => { i.triple.sourceSnapshotHash = null; }, i => { i.stageFileSha256 = "bad"; }, i => { i.stagedRecords[1].source.unmapped = "SYN-PRIVATE"; }, i => { i.stagedRecords[1].sourceRowSha256 = hash("wrong"); }]) {
    const i = input(); mutate(i); stableFailure(() => build(i));
  }
});
test("duplicate source identities are rejected instead of choosing the first parent or change", () => {
  stableFailure(() => build(input([contract(), contract(), change()])));
  stableFailure(() => build(input([contract(), change(), change()])));
});
test("parent matching does not silently coerce case or different employee identity", () => {
  assert.equal(build(input([contract("SYN-C"), change("syn-c")])).artifact.records[0].changeType, "needs_review");
  assert.equal(build(input([contract("SYN-C", "SYN-E"), change("SYN-C", "syn-e")])).artifact.records[0].changeType, "needs_review");
});
test("private CLI rejects malformed input without raw paths, data, or output creation", t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hr-t2-classification-"))); chmodSync(dir, 0o700);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "config.json"), outputPath = join(dir, "out.json");
  writeFileSync(path, JSON.stringify({ privateSentinel: "SYN-PRIVATE", outputPath }), { mode: 0o600 });
  stableFailure(() => materialize(path, { currentHead: () => triple.codeSha })); assert.equal(existsSync(outputPath), false);
  const result = spawnSync(process.execPath, ["scripts/hr-cutover/materialize-production-t2-change-classifications.mjs", "--config", path], { encoding: "utf8" });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.match(result.stderr.trim(), /^[A-Z][A-Z0-9_]+$/u);
  assert.equal(result.stderr.includes(dir), false); assert.equal(result.stderr.includes("SYN-PRIVATE"), false);
  assert.equal(JSON.parse(readFileSync(path)).privateSentinel, "SYN-PRIVATE");
});
