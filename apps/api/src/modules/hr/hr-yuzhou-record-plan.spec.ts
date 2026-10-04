import assert from "node:assert/strict";
import test from "node:test";
import { normalizeYuzhouRecordFields, planYuzhouRecordFields, type YuzhouRecordSourceKind, type YuzhouRecordSourceFacts } from "@jinhu/shared";

for (const kind of ["skill", "credential"] as const) {
  const original = kind === "skill" ? { skillName: "Synthetic skill", legacyGrade: "Original grade", note: null }
    : { credentialType: "synthetic", credentialName: "Synthetic credential", credentialNumber: "SYN-ORIGINAL", issuingAuthority: null, acquiredDate: "2020-01-01", validTo: "2030-01-01", note: null };
  test(`${kind}: unchanged source preserves modern edits and archives`, () => {
    for (const archived of [false, true]) {
      const plan = planYuzhouRecordFields(kind, { note: null }, original, { ...original, note: "Modern edit" }, original, archived);
      assert.equal(plan.action, "unchanged"); assert.deepEqual(plan.writable, {});
    }
  });
  test(`${kind}: partial updates, divergence and convergence`, () => {
    const current = { ...original, note: "Modern edit" };
    const name = kind === "skill" ? "skillName" : "credentialName";
    const plan = planYuzhouRecordFields(kind, { [name]: "New source" }, original, current, original, false);
    assert.equal(plan.action, "update"); assert.deepEqual(plan.writable, { [name]: "New source" });
    const conflict = planYuzhouRecordFields(kind, { [name]: "New source", note: "Different source" }, original, current, original, false);
    assert.equal(conflict.action, "conflict"); assert.deepEqual(conflict.writable, {}); assert.deepEqual(conflict.conflictFields, ["note"]);
    const converged = planYuzhouRecordFields(kind, { note: "Modern edit" }, original, current, original, false);
    assert.equal(converged.action, "update"); assert.deepEqual(converged.writable, {});
    assert.equal(planYuzhouRecordFields(kind, { note: "Modern edit" }, original, current, original, true).action, "conflict");
  });
  test(`${kind}: unknown null baseline is not a clearing instruction`, () => {
    const unknown:YuzhouRecordSourceFacts = { ...original }; delete unknown.note;
    assert.deepEqual(planYuzhouRecordFields(kind, { note: null }, unknown, original, original, false).conflictFields, ["INITIAL_FIELD_BASELINE_UNKNOWN", "note"]);
    assert.deepEqual(normalizeYuzhouRecordFields(kind, { note: " " }), { note: null });
  });
}
test("source allowlist, masks, lengths, Unicode and calendar dates fail safely", () => {
  for (const fields of [{ credentialName: null }, { credentialName: " " }, { credentialNumber: "SYN***" }, { acquiredDate: "1900-02-29" }, { acquiredDate: "0000-01-01" }, { validTo: "2020-01-01T00:00:00" }, { acquiredDate: "2021-01-01", validTo: "2020-01-01" }, { note: "\ud800" }, { note: "x\0y" }, { credentialName: "a".repeat(161) }, { attachmentAssociation: "invented" }]) assert.throws(() => normalizeYuzhouRecordFields("credential", fields), /YUZHOU_RECORD_FIELD_INVALID/);
  for (const fields of [{ proficiency: "advanced" }, { acquiredDate: null }, { legacyGrade: "a".repeat(65) }, { credentialNumber: null }]) assert.throws(() => normalizeYuzhouRecordFields("skill", fields), /YUZHOU_RECORD_FIELD_INVALID/);
  assert.throws(() => normalizeYuzhouRecordFields("experience" as YuzhouRecordSourceKind, {}), /YUZHOU_RECORD_FIELD_INVALID/);
  assert.deepEqual(normalizeYuzhouRecordFields("credential", { acquiredDate: "2000-02-29", credentialNumber: null }), { acquiredDate: "2000-02-29", credentialNumber: null });
});
test("merged date range is checked against omitted current fields", () => {
  const original = { acquiredDate: "2020-01-01", validTo: "2030-01-01" }, current = { ...original, validTo: "2025-01-01" };
  const plan = planYuzhouRecordFields("credential", { acquiredDate: "2026-01-01" }, original, current, original, false);
  assert.equal(plan.action, "conflict"); assert.deepEqual(plan.conflictFields, ["RECORD_DATE_RANGE_INVALID"]); assert.deepEqual(plan.writable, {});
});
