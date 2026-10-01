/* global structuredClone */
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertT5FollowonStageBinding, T5_FOLLOWON_COUNTS, validateT5FollowonAuthorization, validateT5FollowonBinding } from "../hr-cutover/t5-followon-binding.mjs";
import { T5_FULL_COUNTS } from "../hr-cutover/t5-full-archive-private-stage.mjs";
import { fixtureAuthorization, fixtureBinding, H } from "./yuzhou-t4-followon-fixture.mjs";
function binding() {
  const core = fixtureBinding();
  const value = { ...core }; delete value.amountTotals; delete value.mode;
  return { ...value, artifactKind: "yuzhou_t5_followon_binding", intent: "APPEND_T5_FULL_HISTORY_ONCE",
    actorId: "00000000-0000-4000-8000-000000000001",
    windowEndsAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    payrollParent: { operationId: "yzprod-import-20261001T000000Z-cccccccccccc", bindingSha256: H("T4-binding"),
      ownedStateSha256: H("T4-state"), receiptSha256: H("T4-receipt") },
    files: Object.fromEntries([...Object.keys(T5_FULL_COUNTS), "catalog", "definitions", "safeDefinitionEvidence"].map(name => [name, H(name)])),
    counts: T5_FOLLOWON_COUNTS, sourceCatalogSha256: H("catalog"),
    sourceMappingContractSha256: "d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0",
    productionKeyObservationSha256: H("synthetic-key-observation"), photoBundleSha256: H("photo-bundle"),
    photoSourceCustodySha256: H("photo-custody"), photoNormalizationReceiptSha256: H("normalization"),
    photoWorkerImageId: `sha256:${H("worker")}` };
}
test("T5 full source has its own mapping hash and binds core, payroll and runtime", () => {
  const value = binding();
  assert.notEqual(value.sourceMappingContractSha256, value.triple.mappingContractHash);
  assert.equal(validateT5FollowonBinding(value), value);
  const authorization = fixtureAuthorization(value);
  assert.equal(typeof validateT5FollowonAuthorization({ binding: value, authorization }), "string");
  for (const change of [b => { b.payrollParent.ownedStateSha256 = H("changed"); },
    b => { b.runtimeReceiptSha256 = H("changed"); }, b => { b.productionKeyObservationSha256 = H("changed"); }]) {
    const changed = structuredClone(value); change(changed);
    assert.throws(() => validateT5FollowonAuthorization({ binding: changed, authorization }), /BINDING_DRIFT/u);
  }
});
test("missing empty source, recycled operations, wrong mapping/counts and long windows fail", () => {
  for (const change of [b => { delete b.files.jch_1; }, b => { b.operationId = b.parent.operationId; },
    b => { b.payrollParent.operationId = b.parent.operationId; }, b => { b.sourceMappingContractSha256 = b.triple.mappingContractHash; },
    b => { b.counts = { ...b.counts, sourceRecords: 7752 }; },
    b => { b.windowEndsAt = new Date(Date.parse(b.windowStartsAt) + 3600001).toISOString(); }]) {
    const value = binding(); change(value); assert.throws(() => validateT5FollowonBinding(value));
  }
});
test("signed append cannot serve as rollback and expires at the actual deadline", () => {
  const value = binding(), authorization = fixtureAuthorization(value);
  assert.throws(() => validateT5FollowonAuthorization({ binding: value, authorization, intent: "rollback" }), /BINDING_DRIFT/u);
  assert.throws(() => validateT5FollowonAuthorization({ binding: value, authorization, now: new Date(value.windowEndsAt) }), /EXPIRED/u);
});
test("every source hash is independently checked before opening the full private stage", () => {
  const value = binding(), input = { manifest: { sha256: value.manifestSha256 },
    files: Object.fromEntries(Object.keys(T5_FULL_COUNTS).map(name => [name, { sha256: value.files[name] }])),
    ...Object.fromEntries(["catalog", "definitions", "safeDefinitionEvidence"].map(name => [name, { sha256: value.files[name] }])) };
  assert.equal(assertT5FollowonStageBinding(input, value).businessSha256, value.sourceBusinessSha256);
  input.files.train.sha256 = H("changed-empty");
  assert.throws(() => assertT5FollowonStageBinding(input, value), /STAGE_BINDING_DRIFT/u);
});
