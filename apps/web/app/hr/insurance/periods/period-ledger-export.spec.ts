import assert from "node:assert/strict";
import test from "node:test";
import type { HrInsuranceOwnedPeriodListItem } from "@jinhu/shared";
import { insuranceOwnedPeriodLedgerCsv } from "./period-ledger-export";
const kinds = ["oldage", "remedy", "losework", "wound", "bear", "fund"] as const;
const row: HrInsuranceOwnedPeriodListItem = { id: "private-id", employeeId: "private-employee", employeeCode: "=SYN", fullName: "+合成人员", periodMonth: "2026-10", revisionNo: 2, previewId: "private-preview", previousRevisionId: "private-old", previewHash: "private-hash", sourceKind: "modern_confirmed", status: "closed", current: false, calculation: { engineVersion: "private-engine", policyVersion: 3, includeFund: true, items: kinds.map((insuranceKind, index) => ({ insuranceKind, contributionBase: `${index + 10}.00`, amounts: { base: "0.00", employer: "0.00", employee: "0.00", supplement: "0.00" } })), totals: { base: "1.00", employer: "2.00", employee: "3.00", supplement: "4.00" } } };
test("owned-period ledger has a strict allowlist, exact text and formula-safe CSV", () => { const csv = insuranceOwnedPeriodLedgerCsv([row]); for (const expected of ["养老基数", "10.00", "15.00", "1.00", "4.00", "历史版本", "计入汇总", "'=SYN", "'+合成人员"]) assert.ok(csv.includes(expected)); for (const forbidden of ["private-id", "private-employee", "private-preview", "private-old", "private-hash", "private-engine", "policyVersion"]) assert.ok(!csv.includes(forbidden)); });
test("owned-period ledger rejects missing, duplicate or malformed financial projection", () => { for (const calculation of [{ ...row.calculation, items: row.calculation.items.slice(1) }, { ...row.calculation, items: [...row.calculation.items.slice(0, 5), row.calculation.items[0]!] }, { ...row.calculation, totals: { ...row.calculation.totals, employer: "bad" } }]) assert.throws(() => insuranceOwnedPeriodLedgerCsv([{ ...row, calculation }])); });
test("owned-period ledger rejects malformed runtime record flags", () => {
  assert.throws(() => insuranceOwnedPeriodLedgerCsv([{ ...row, current: "false" as unknown as boolean }]));
  assert.throws(() => insuranceOwnedPeriodLedgerCsv([{ ...row, calculation: { ...row.calculation, items: [null, ...row.calculation.items.slice(1)] } as unknown as typeof row.calculation }]));
});
