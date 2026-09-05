import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { recoverProductionT3LegacyPolicy as recover } from "../hr-cutover/production-t3-policy-recovery.mjs";
import { projectProductionT3Fields as project } from "../hr-cutover/production-t3-field-projection.mjs";
import { deriveProductionT3ChildProvenance as child } from "../hr-cutover/materialize-production-t3-phase-artifact.mjs";

const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"];
const fields = [["baseRate", ""], ["employerRate", "_e"], ["employeeRate", "_p"], ["supplementRate", "_pc"]];
const hash = value => createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
function rawPolicy() {
  const raw = { id: 501, des: "Synthetic policy", rightscope: "0" };
  for (const kind of kinds) for (const [, suffix] of fields) {
    raw[`${kind}${suffix}`] = "16.000";
    raw[`${kind}${suffix}2`] = "12.345";
  }
  return raw;
}
function stage(raw = rawPolicy()) {
  return {
    sourceTable: "dbo.insure_method", sourceKey: String(raw.id),
    sourceIdentitySha256: hash(`dbo.insure_method\0${raw.id}`), sourceRowSha256: hash(canonical(raw)),
    source: { id: raw.id, name: raw.des, scope: raw.rightscope },
    items: kinds.flatMap(kind => [1, 2].map(variant => ({ kind, variant,
      ...Object.fromEntries(fields.map(([name, suffix]) => [name, raw[`${kind}${suffix}${variant === 2 ? "2" : ""}`]])),
    }))),
  };
}
const fails = fn => assert.throws(fn, error => /^T3_POLICY_RECOVERY_[A-Z0-9_]+$/u.test(error.code ?? "") && !String(error.message).includes("Synthetic"));

test("all 51 raw fields authenticate before twelve historical items become six normalized items", () => {
  const raw = rawPolicy(), input = stage(raw), result = recover(input);
  assert.equal(Object.keys(raw).length, 51);
  assert.equal(result.normalizedRecord.items.length, 6);
  assert.equal(result.normalizedRecord.sourceIdentitySha256, input.sourceIdentitySha256);
  assert.equal(result.normalizedRecord.sourceRowSha256, input.sourceRowSha256);
  assert.deepEqual(result.normalizedRecord.source, input.source);
  for (const item of result.normalizedRecord.items) {
    assert.equal(item.variant, 1);
    for (const [field] of fields) assert.equal(item[field], "0.16");
    for (const field of ["baseFixedAmount", "employerFixedAmount", "employeeFixedAmount", "supplementFixedAmount"]) assert.equal(item[field], "12.345");
  }
  assert.equal(result.proof.productionImport, "HOLD");
  assert.equal(result.proof.status, "SOURCE_RECONSTRUCTION_VERIFIED");
  assert.equal(result.proof.reconstructedFieldCount, 51);
  assert.equal(result.proof.sourceItemCount, 12);
  assert.equal(result.proof.normalizedItemCount, 6);
  assert.equal(result.proof.sourceRowSha256, input.sourceRowSha256);
  assert.equal(result.proof.normalizedContentSha256, hash(canonical(result.normalizedRecord)));
});

test("lineage conserves each old child exactly once and targets the existing variant-one identities", () => {
  const input = stage(), result = recover(input), oldIds = new Set(), newIds = new Set();
  assert.equal(result.lineage.length, 6);
  for (const link of result.lineage) {
    assert.equal(link.sourceProjections.length, 2);
    assert.ok(kinds.includes(link.insuranceKind));
    for (let index = 0; index < 2; index++) {
      const expected = child(input.sourceIdentitySha256, "hr_insurance_policy_item", `${link.insuranceKind}\0${index + 1}`, input.sourceRowSha256);
      assert.equal(link.sourceProjections[index].sourceIdentitySha256, expected.sourceIdentitySha256);
      assert.equal(link.sourceProjections[index].sourceRowSha256, expected.sourceRowSha256);
      assert.ok(!oldIds.has(expected.sourceIdentitySha256)); oldIds.add(expected.sourceIdentitySha256);
    }
    assert.deepEqual(link.targetProjection, link.sourceProjections[0]);
    newIds.add(link.targetProjection.sourceIdentitySha256);
  }
  assert.equal(oldIds.size, 12); assert.equal(newIds.size, 6);
  const projected = project(result.normalizedRecord).filter(row => row.targetTable === "hr_insurance_policy_item");
  assert.deepEqual(new Set(projected.map(row => row.sourceIdentitySha256)), newIds);
  assert.ok(projected.every(row => row.reasonCode === null && row.dependencyRefs.length === 1));
});

test("null, zero and signed fixed addends retain their separate meanings without floating point", () => {
  const raw = rawPolicy(); raw.oldage = null; raw.oldage_e = "0.000"; raw.oldage_p = "1234.567";
  raw.oldage2 = null; raw.oldage_e2 = "0.000"; raw.oldage_p2 = "-1.234";
  const result = recover(stage(raw)), item = result.normalizedRecord.items.find(item => item.kind === "oldage");
  assert.equal(item.baseRate, null); assert.equal(item.employerRate, "0"); assert.equal(item.employeeRate, "12.34567");
  assert.equal(item.baseFixedAmount, null); assert.equal(item.employerFixedAmount, "0"); assert.equal(item.employeeFixedAmount, "-1.234");
  const projected = project(result.normalizedRecord);
  assert.equal(projected.length, 7);
  assert.equal(projected.filter(row => row.reasonCode === "T3_NEGATIVE_DECIMAL_UNSUPPORTED").length, 1);
});

test("all four rate and addend slots are independent, not swapped or silently replicated", () => {
  const raw = rawPolicy();
  for (const [index, [, suffix]] of fields.entries()) { raw[`bear${suffix}`] = `${index + 1}.234`; raw[`bear${suffix}2`] = `${index + 5}.678`; }
  const item = recover(stage(raw)).normalizedRecord.items.find(item => item.kind === "bear");
  assert.deepEqual(fields.map(([field]) => item[field]), ["0.01234", "0.02234", "0.03234", "0.04234"]);
  assert.deepEqual([item.baseFixedAmount, item.employerFixedAmount, item.employeeFixedAmount, item.supplementFixedAmount], ["5.678", "6.678", "7.678", "8.678"]);
});

test("raw field or source metadata drift cannot retain the original row hash", () => {
  for (const mutate of [r => { r.items[0].baseRate = "17.000"; }, r => { r.items[1].supplementRate = "13.345"; }, r => { r.source.name = "different"; }, r => { r.source.scope = null; }, r => { r.sourceRowSha256 = hash("wrong"); }]) {
    const input = stage(); mutate(input); fails(() => recover(input));
  }
});

test("partial, duplicate, mixed, unknown and current layouts cannot be reinterpreted", () => {
  for (const mutate of [r => { r.items.pop(); }, r => { r.items.push(structuredClone(r.items[0])); }, r => { r.items[0].kind = "unknown"; }, r => { r.items[0].variant = 3; }, r => { r.items[0].baseFixedAmount = null; }, r => { delete r.items[0].baseRate; }, r => { r.source.unknown = null; }]) {
    const input = stage(); mutate(input); fails(() => recover(input));
  }
  fails(() => recover(recover(stage()).normalizedRecord));
  const wrongTable = stage(); wrongTable.sourceTable = "dbo.person_insure"; fails(() => recover(wrongTable));
});

test("untrusted amount types, blank values and negative percentage rates fail safely", () => {
  for (const value of [0, false, "", " ", "bad", "-1.000"]) { const raw = rawPolicy(); raw.oldage = value; fails(() => recover(stage(raw))); }
  const input = stage(); input.sourceKey = "different"; fails(() => recover(input));
});

test("source item order does not affect recovery, and inputs or outputs cannot mutate one another", () => {
  const input = stage(), before = structuredClone(input), result = recover(input);
  assert.deepEqual(input, before);
  const reversed = structuredClone(input); reversed.items.reverse();
  assert.deepEqual(recover(reversed), result);
  result.normalizedRecord.source.name = "mutated"; result.normalizedRecord.items[0].baseRate = "changed";
  assert.deepEqual(input, before);
  assert.deepEqual(recover(input), recover(before));
});

test("proof and lineage contain only hashes, fixed metadata and counts, not recovered source values", () => {
  const result = recover(stage()), publicText = JSON.stringify({ proof: result.proof, lineage: result.lineage });
  assert.doesNotMatch(publicText, /Synthetic|12\.345|16\.000|rightscope|sourceKey|password|credential|\/Users\//u);
  assert.doesNotMatch(JSON.stringify(result.proof), /"(?:source|items|normalizedRecord)":/u);
});
