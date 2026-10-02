import assert from "node:assert/strict";
import test from "node:test";
import { payrollInsuranceEvidence } from "./hr-payroll-insurance-evidence";

const historical = { insuranceHistoricalId: "synthetic-history", insuranceFrozenId: "synthetic-history", insuranceFrozenVersion: "1" };
const modern = { insuranceModernId: "synthetic-modern", insuranceFrozenId: "synthetic-modern", insuranceFrozenVersion: "1", insuranceFrozenFormat: "insurance-modern-v1", insuranceFrozenHash: "a".repeat(64) };
test("historical and modern frozen identities use an explicit metadata allowlist", () => {
  assert.deepEqual(payrollInsuranceEvidence({ ...historical, privatePayload: "synthetic-protected" }), { sourceKind: "historical", sourceId: "synthetic-history", version: "1" });
  assert.deepEqual(payrollInsuranceEvidence(modern), { sourceKind: "modern_confirmed", sourceId: "synthetic-modern", version: "1", snapshotHash: "a".repeat(64) });
});
test("missing, conflicting or mismatched bindings never invent a source", () => {
  for (const row of [{}, { ...modern, insuranceHistoricalId: "synthetic-history" }, { ...modern, insuranceFrozenId: "another-source" }, { ...historical, insuranceFrozenId: null }]) assert.equal(payrollInsuranceEvidence(row), null);
});
test("malformed versions and modern hashes remain unavailable", () => {
  for (const version of [null, 1, "0", "-1", "1.5", "2147483648", "12345678901"]) assert.equal(payrollInsuranceEvidence({ ...modern, insuranceFrozenVersion: version }), null);
  for (const hash of [null, "bad", "A".repeat(64)]) assert.equal(payrollInsuranceEvidence({ ...modern, insuranceFrozenHash: hash }), null);
  assert.equal(payrollInsuranceEvidence({ ...modern, insuranceFrozenFormat: "insurance-facts-v1" }), null);
});
