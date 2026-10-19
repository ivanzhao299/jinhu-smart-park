import type { FormalPayrollInput, FormalPayrollSourcePreparation } from "@jinhu/shared";

export type PayrollInputReviewIntent = {
  id: string;
  periodId: string;
  ruleSetId: string;
  ruleVersionId: string;
  revisionNo: number;
  status: string;
  sourceReturn?: Pick<FormalPayrollSourcePreparation, "legacyBatchId" | "month">;
  nonce: number;
};

/** Validate a save receipt before it can select an independently re-read draft. */
export function payrollInputReviewIntent(
  receipt: FormalPayrollInput,
  expected: Pick<PayrollInputReviewIntent, "periodId" | "ruleSetId" | "ruleVersionId"> & { employeeCount: number },
  sourceReturn?: PayrollInputReviewIntent["sourceReturn"],
): PayrollInputReviewIntent | null {
  if (
    !receipt.id || receipt.periodId !== expected.periodId || receipt.ruleSetId !== expected.ruleSetId
    || receipt.ruleVersionId !== expected.ruleVersionId || !Number.isSafeInteger(receipt.revisionNo)
    || receipt.revisionNo < 1 || !Number.isSafeInteger(receipt.version) || receipt.version < 1 || receipt.status !== "draft" || !Array.isArray(receipt.employees)
    || receipt.employees.length !== expected.employeeCount || receipt.employees.length < 1 || receipt.employees.length > 2000
  ) return null;
  return { id: receipt.id, periodId: receipt.periodId, ruleSetId: receipt.ruleSetId, ruleVersionId: receipt.ruleVersionId, revisionNo: receipt.revisionNo, status: receipt.status, ...(sourceReturn ? { sourceReturn } : {}), nonce: Date.now() };
}
