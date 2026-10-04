import assert from "node:assert/strict";
import test from "node:test";
import { normalizeYuzhouFamilyFields, planYuzhouFamilyFields, type YuzhouFamilySourceFacts } from "@jinhu/shared";

const original: YuzhouFamilySourceFacts = { relationship: "子女", fullName: "Synthetic family", contact: "SYN-CONTACT", birthDate: null, workUnit: "原单位", jobTitle: null, politicalStatus: null };

test("unchanged source preserves independent modern edits, even an archived target", () => {
  for (const archived of [false, true]) {
    const current = { ...original, workUnit: "平台修改", contact: null };
    assert.deepEqual(planYuzhouFamilyFields({ workUnit: original.workUnit, contact: original.contact }, original, current, original, archived), { action: "unchanged", changedFields: [], conflictFields: [], writable: {} });
  }
});
test("source changes only admitted fields; omitted and modern unrelated fields survive", () => {
  const current = { ...original, contact: null };
  const plan = planYuzhouFamilyFields({ workUnit: " 来源更新 " }, original, current, original, false);
  assert.equal(plan.action, "update"); assert.deepEqual(plan.writable, { workUnit: "来源更新" });
  assert.equal("contact" in plan.writable, false); assert.equal("fullName" in plan.writable, false);
});
test("divergent field edits conflict atomically; independently converged edits accept without rewriting", () => {
  const current = { ...original, workUnit: "平台修改" };
  const conflict = planYuzhouFamilyFields({ workUnit: "来源修改", jobTitle: "新职务" }, original, current, original, false);
  assert.equal(conflict.action, "conflict"); assert.deepEqual(conflict.conflictFields, ["workUnit"]); assert.deepEqual(conflict.writable, {});
  const converged = planYuzhouFamilyFields({ workUnit: "平台修改" }, original, current, original, false);
  assert.equal(converged.action, "update"); assert.deepEqual(converged.writable, {}); assert.deepEqual(converged.changedFields, ["workUnit"]);
});
test("archive never accepts a changed source as a resurrection", () => {
  const plan = planYuzhouFamilyFields({ contact: null }, original, original, original, true);
  assert.equal(plan.action, "conflict"); assert.deepEqual(plan.conflictFields, ["FAMILY_ARCHIVED"]); assert.deepEqual(plan.writable, {});
});
test("unknown initial field requires evidence, including an incoming explicit null", () => {
  const accepted: Partial<YuzhouFamilySourceFacts> = { ...original }; delete accepted.birthDate;
  const plan = planYuzhouFamilyFields({ birthDate: null }, accepted, original, original, false);
  assert.equal(plan.action, "conflict"); assert.deepEqual(plan.conflictFields, ["INITIAL_FIELD_BASELINE_UNKNOWN", "birthDate"]);
});
test("explicit clears, strict calendar dates and field ownership stay bounded", () => {
  assert.deepEqual(normalizeYuzhouFamilyFields({ contact: null, jobTitle: "  ", birthDate: "2000-02-29" }), { contact: null, jobTitle: null, birthDate: "2000-02-29" });
  for (const fields of [{ birthDate: "1900-02-29" }, { birthDate: "0000-01-01" }, { birthDate: "2026-10-04T12:00:00" }, { relationship: null }, { fullName: " " }, { contact: "x".repeat(65) }, { fullName: "\ud800" }, { workUnit: "a\0b" }, { identityNumber: "not reviewed" }, { isEmergencyContact: true }])
    assert.throws(() => normalizeYuzhouFamilyFields(fields), /YUZHOU_FAMILY_FIELD_INVALID/);
});
