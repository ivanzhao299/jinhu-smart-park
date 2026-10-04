import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canonicalProfile } from "../hr-cutover/yuzhou-profile-incremental-projection.mjs";
import { projectYuzhouInsurancePolicy, YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE } from "../hr-cutover/yuzhou-insurance-policy-incremental-projection.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
function fixture(overrides = {}) {
  const source = { id: 7, des: "合成政策", rightscope: "原范围文本", ...Object.fromEntries(YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE.slice(3).map((entry, i) => [entry.sourceField, i % 2 ? "-1.250" : "12.500"])), ...overrides };
  return { sourceTable: "dbo.insure_method", sourceKey: String(source.id), sourceIdentitySha256: hash(`dbo.insure_method\0${source.id}`), sourceRowSha256: hash(canonicalProfile(source)), source };
}
test("all 51 fields preserve paired percent/fixed semantics without mutating source", () => {
  assert.equal(YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE.length, 51);
  assert.equal(new Set(YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE.map(x => x.sourceField)).size, 51);
  const row = fixture(), before = JSON.stringify(row), result = projectYuzhouInsurancePolicy(row);
  assert.equal(JSON.stringify(row), before);
  assert.equal(result.candidate.fields.items.length, 6);
  for (const item of result.candidate.fields.items) {
    assert.equal(item.variant, 1);
    for (const component of ["base", "employer", "employee", "supplement"]) {
      assert.equal(item[`${component}Rate`], "0.125");
      assert.equal(item[`${component}FixedAmount`], "-1.25");
    }
  }
  assert.equal(result.candidate.fields.scopeDescription, row.source.rightscope);
  assert.equal(result.declaration.activated, false);
  assert.equal(result.admission, "pending_insurance_policy_api_executor");
});
test("NULL, zero and nullable descriptions stay distinct; output is detached", () => {
  const row = fixture({ des: null, rightscope: null, oldage: null, oldage2: "0.000" });
  const result = projectYuzhouInsurancePolicy(row);
  assert.equal(result.candidate.fields.name, null);
  assert.equal(result.candidate.fields.items[0].baseRate, null);
  assert.equal(result.candidate.fields.items[0].baseFixedAmount, "0");
  result.candidate.fields.items[0].baseRate = "1";
  assert.equal(row.source.oldage, null);
});
test("48 distinct values retain the exact kind and component binding", () => {
  const source = {}, expectations = [];
  let index = 0;
  for (const kind of ["oldage", "remedy", "losework", "fund", "wound", "bear"]) {
    for (const [suffix, component] of [["", "base"], ["_e", "employer"], ["_p", "employee"], ["_pc", "supplement"]]) {
      index++;
      source[`${kind}${suffix}`] = `${index}.123`;
      source[`${kind}${suffix}2`] = `-${index}.321`;
      expectations.push({ kind, component, rate: `0.${String(index * 1000 + 123).padStart(5, "0")}`, fixed: `-${index}.321` });
    }
  }
  const result = projectYuzhouInsurancePolicy(fixture(source));
  for (const expected of expectations) {
    const item = result.candidate.fields.items.find(item => item.kind === expected.kind);
    assert.equal(item[`${expected.component}Rate`], expected.rate);
    assert.equal(item[`${expected.component}FixedAmount`], expected.fixed);
  }
});
test("re-extraction time/order do not change facts; precise changes alter digest", () => {
  const row = fixture(), reordered = { ...row, extractedAt: "2099-01-01", source: Object.fromEntries(Object.entries(row.source).reverse()) };
  assert.equal(projectYuzhouInsurancePolicy(row).candidate.rowDigest, projectYuzhouInsurancePolicy(reordered).candidate.rowDigest);
  assert.notEqual(projectYuzhouInsurancePolicy(row).candidate.rowDigest, projectYuzhouInsurancePolicy(fixture({ oldage2: "-1.251" })).candidate.rowDigest);
});
test("tamper, identity, missing/new fields and malformed numeric input fail with safe codes", () => {
  const invalid = [];
  const tampered = fixture(); tampered.source.oldage = "14.000"; invalid.push(tampered);
  invalid.push({ ...fixture(), sourceKey: "007" }, { ...fixture(), sourceIdentitySha256: "0".repeat(64) });
  for (const value of [0.1, "1e2", "", "1.0001", "1000000000000000", "NaN"]) invalid.push(fixture({ oldage: value }));
  invalid.push(fixture({ unknown: "new" }), fixture({ des: "x".repeat(51) }), fixture({ rightscope: "x".repeat(31) }));
  const missing = fixture(); delete missing.source.oldage2; missing.sourceRowSha256 = hash(canonicalProfile(missing.source)); invalid.push(missing);
  for (const row of invalid) assert.throws(() => projectYuzhouInsurancePolicy(row), error => /^YUZHOU_INSURANCE_POLICY_[A-Z_]+$/u.test(error.code) && error.message === error.code);
  assert.throws(() => projectYuzhouInsurancePolicy(fixture({ oldage: "-0.001" })), /NORMALIZATION_INVALID/u);
});
test("SQL numeric boundary and null schema extension preserve exact facts", () => {
  const result = projectYuzhouInsurancePolicy(fixture({ oldage: "999999999999999.999", oldage2: "-999999999999999.999", unknown: null }));
  assert.equal(result.candidate.fields.items[0].baseRate, "9999999999999.99999");
  assert.equal(result.candidate.fields.items[0].baseFixedAmount, "-999999999999999.999");
});
