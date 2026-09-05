import assert from "node:assert/strict";
import test from "node:test";
import { freezeProductionImportCandidates as freeze } from "../hr-cutover/production-import-candidate-freeze.mjs";
import { generateProductionImportPayloads } from "../hr-cutover/production-import-payload-generator.mjs";
import { fixture, inputFor, descriptor, decode, hash, existing, quarantine, reviewFor } from "./yuzhou-production-import-candidate-freeze-fixture.mjs";
import { assembleProductionT2DecisionCandidates } from "../hr-cutover/production-t2-decision-candidates.mjs";
import { assembleProductionT3DecisionCandidates } from "../hr-cutover/production-t3-decision-candidates.mjs";

const reject = input => assert.throws(() => freeze(input), error => /^CANDIDATE_FREEZE_[A-Z0-9_]+$/u.test(error.code) && error.message === error.code);
test("all sixteen producer-shaped tables reach existing bridge/generator without reviews, deterministically and without mutation", () => {
  const input = inputFor(fixture()), saved = structuredClone(input), out = freeze(input);
  assert.equal(out.summary.status, "READY"); assert.equal(out.summary.productionImport, "HOLD");
  assert.equal(out.summary.recordCount, 16); assert.equal(out.summary.missingReviewCount, 0);
  assert.equal(out.bridge.targetTableCoverage.presentCount, 16);
  assert.equal(generateProductionImportPayloads(out.bridge.generatorInput).planPhases.flatMap(row => row.records).length, 16);
  assert.deepEqual(input, saved); assert.deepEqual(freeze(input), out);
  assert.equal(out.wrappers.decisions.payload.records.find(row => row.phase === "T1").dependencyRefs[0].candidateDisposition, undefined);
});
test("explicit zero tables survive preparation", () => {
  const f = fixture(); f.records = f.records.filter(row => row.targetTable !== "hr_contract_legacy_evidence");
  const out = freeze(inputFor(f)); assert.equal(out.summary.status, "READY");
  assert.equal(out.summary.targetTableCounts.hr_contract_legacy_evidence, 0); assert.equal(out.summary.recordCount, 15);
});
test("actual T2/T3 assembler outputs use exact normalized phase bytes and explicit zero domains", () => {
  const f = fixture(), input = inputFor(f), t0Candidates = decode(input.candidateArtifacts.T0);
  const t2Phase = decode(input.phaseArtifacts.T2); t2Phase.records = [];
  for (const table of Object.keys(t2Phase.targetTableCounts)) t2Phase.targetTableCounts[table] = 0;
  input.phaseArtifacts.T2 = descriptor(t2Phase);
  const t2 = assembleProductionT2DecisionCandidates({ triple: f.triple, targetScope: f.scope, targetInventory: f.inventory, t0Candidates,
    phaseArtifact: t2Phase, stagedRecords: [], resolutions: [], artifactHashes: { phaseArtifactSha256: input.phaseArtifacts.T2.sha256,
      targetInventoryArtifactSha256: input.targetInventoryArtifact.sha256, t0CandidatesArtifactSha256: input.candidateArtifacts.T0.sha256, resolutionArtifactSha256: hash("empty synthetic resolutions") } });
  const t3 = assembleProductionT3DecisionCandidates({ triple: f.triple, targetScope: f.scope, targetInventory: f.inventory, t0Candidates,
    stagedRecords: [], attendanceFileSha256: hash("empty synthetic attendance"), artifactHashes: { targetInventoryArtifactSha256: input.targetInventoryArtifact.sha256, t0CandidatesArtifactSha256: input.candidateArtifacts.T0.sha256 } });
  input.candidateArtifacts.T2 = descriptor(t2); input.phaseArtifacts.T3 = descriptor(t3.phaseArtifact); input.candidateArtifacts.T3 = descriptor(t3.candidates);
  const out = freeze(input); assert.equal(out.summary.status, "READY"); assert.equal(out.summary.recordCount, 5);
  assert.equal(out.summary.targetTableCounts.hr_attendance_import_batch, 1); assert.equal(out.summary.targetTableCounts.hr_contract, 0);
  assert.equal(out.wrappers.decisions.payload.phaseManifests.T3, t3.candidates.phaseArtifactSha256);
});
test("missing non-insert review is counted HOLD with retained original reason and dangling refs", () => {
  const f = fixture(), row = quarantine(f, "hr_employee_insurance_item", true), out = freeze(inputFor(f));
  assert.equal(out.summary.missingReviewCount, 1); assert.equal(out.summary.status, "REVIEW_HOLD");
  assert.equal(out.wrappers, null); assert.equal(out.bridge, null);
  assert.deepEqual(out.evidence.records.find(item => item.candidate.sourceIdentitySha256 === row.sourceIdentitySha256).candidate, row);
});
test("real synthetic signed evidence and GCM envelopes support skip, merge and explicit quarantine projection", async () => {
  const f = fixture(), skip = existing(f, "hr_contract_legacy_evidence", "skip_exact");
  const merge = existing(f, "hr_attendance_symbol_rule", "review_target_collision");
  const blocked = quarantine(f, "hr_employee_insurance_item", true);
  f.reviews = [await reviewFor(f, skip.row, "skip_approved"), await reviewFor(f, merge.row, "merge", merge.before), await reviewFor(f, blocked, "quarantine")];
  const input = inputFor(f), out = freeze(input);
  assert.equal(out.summary.status, "READY"); assert.equal(out.evidence.signatureAuthenticityVerified, false);
  const decisions = out.wrappers.decisions.payload.records;
  assert.equal(decisions.filter(row => row.disposition === "merge").length, 1);
  assert.equal(decisions.filter(row => row.disposition === "skip_approved").length, 1);
  assert.deepEqual(decisions.find(row => row.disposition === "quarantine").dependencyRefs, []);
  assert.equal(out.evidence.records.find(row => row.candidate.sourceIdentitySha256 === blocked.sourceIdentitySha256).candidate.dependencyRefs.length, 1);
  const altered = decode(input.reviewedDecisionsArtifact); altered.records[2].cryptoEnvelope.ciphertextBase64 = Buffer.from("wrong ciphertext").toString("base64");
  input.reviewedDecisionsArtifact = descriptor(altered); reject(input);
});
test("missing review does not conceal invalid inserts, coverage, T0 or target bindings", () => {
  const mutations = [
    input => { input.phaseArtifacts.T3.sha256 = hash("wrong bytes"); },
    input => { input.expectedTriple = { ...input.expectedTriple, codeSha: "b".repeat(40) }; },
    input => { const c = decode(input.candidateArtifacts.T1); c.t0DecisionCandidatesArtifactSha256 = hash("stale T0"); input.candidateArtifacts.T1 = descriptor(c); },
    input => { const c = decode(input.candidateArtifacts.T2); c.targetTableCounts.hr_contract = 0; input.candidateArtifacts.T2 = descriptor(c); },
    input => { const c = decode(input.candidateArtifacts.T3); c.countByDisposition.insert++; input.candidateArtifacts.T3 = descriptor(c); },
    input => { const c = decode(input.candidateArtifacts.T3); c.records[0].unexpected = true; input.candidateArtifacts.T3 = descriptor(c); },
    input => { const c = decode(input.candidateArtifacts.T3); c.records[0].expectedTargetId = "00000000-0000-5000-8000-000000000001"; input.candidateArtifacts.T3 = descriptor(c); },
    input => { const c = decode(input.candidateArtifacts.T1); c.records[0].dependencyRefs[0].candidateDisposition = "skip_exact"; input.candidateArtifacts.T1 = descriptor(c); },
    input => { const c = decode(input.candidateArtifacts.T2); c.records[0].targetFields.password = "must-not-log"; input.candidateArtifacts.T2 = descriptor(c); },
    input => { const c = decode(input.candidateArtifacts.T3); c.records.pop(); input.candidateArtifacts.T3 = descriptor(c); },
    input => { const c = decode(input.targetScopeArtifact); c.parkId = "wrong"; input.targetScopeArtifact = descriptor(c); },
    input => { const c = decode(input.targetInventoryArtifact); c.targetTableCounts.hr_employee = 1; input.targetInventoryArtifact = descriptor(c); },
  ];
  for (const mutate of mutations) { const f = fixture(); quarantine(f, "hr_employee_insurance_item", true); const input = inputFor(f); mutate(input); reject(input); }
});
test("quarantine cannot become insert and review evidence cannot be missing, extra, duplicated or stale", async () => {
  const f = fixture(), row = quarantine(f, "hr_employee_insurance_item", true);
  f.reviews = [await reviewFor(f, row, "quarantine")];
  for (const mutate of [
    r => { r.records[0].decision.disposition = "insert"; },
    r => { r.records[0].sourceRowSha256 = hash("stale"); },
    r => { r.records[0].attestationBase64 = ""; },
    r => { r.records.push(structuredClone(r.records[0])); },
    r => { r.records[0].sourceIdentitySha256 = hash("extra"); },
    r => { r.records[0].decision.quarantine.reasonCode = "REPLACED_REASON"; },
    r => { r.records[0].decision.targetFields = { remark: "modified after external signing" }; },
    r => { r.candidateArtifactSha256.T0 = hash("stale"); },
  ]) { const input = inputFor(f), r = decode(input.reviewedDecisionsArtifact); mutate(r); input.reviewedDecisionsArtifact = descriptor(r); reject(input); }
  f.reviews = [await reviewFor(f, row, "quarantine", undefined, row.dependencyRefs)];
  reject(inputFor(f));
});
test("quarantined parent cannot be consumed by an inserted child", () => {
  const f = fixture(); quarantine(f, "hr_insurance_policy"); reject(inputFor(f));
});
test("reviewed quarantine may retain a valid quarantine-parent reference", async () => {
  const f = fixture(), parent = quarantine(f, "hr_employee_insurance_period"), child = quarantine(f, "hr_employee_insurance_item");
  f.reviews = [await reviewFor(f, parent, "quarantine"), await reviewFor(f, child, "quarantine", undefined, child.dependencyRefs)];
  const out = freeze(inputFor(f)); assert.equal(out.summary.status, "READY");
  assert.equal(out.wrappers.decisions.payload.records.find(row => row.sourceIdentitySha256 === child.sourceIdentitySha256).dependencyRefs.length, 1);
});
test("reviewed quarantine dependency cycles remain bridge HOLD without wrappers", async () => {
  const f = fixture(), template = structuredClone(f.records.find(row => row.targetTable === "sys_org"));
  const extras = ["cycle-a", "cycle-b"].map(label => ({ ...structuredClone(template), sourceIdentitySha256: hash(label), sourcePkCanonical: `sha256:${hash(label)}`,
    candidateDisposition: "quarantine", reasonCode: "SOURCE_HIERARCHY_INVALID", targetFields: null, businessIdentitySha256: null, expectedTargetId: null,
    expectedTargetVersion: null, expectedTargetCanonicalSha256: null }));
  for (const [index, row] of extras.entries()) row.dependencyRefs = [{ role: "parent_org", phase: "T0", sourceIdentitySha256: extras[1 - index].sourceIdentitySha256, expectedTargetTable: "sys_org" }];
  f.records.push(...extras);
  f.reviews = await Promise.all(extras.map(row => reviewFor(f, row, "quarantine", undefined, row.dependencyRefs)));
  const out = freeze(inputFor(f)); assert.equal(out.summary.status, "REVIEW_HOLD"); assert.equal(out.wrappers, null);
  assert.deepEqual(out.summary.reasonCodes, ["PRODUCTION_IMPORT_DEPENDENCY_CYCLE"]);
});
