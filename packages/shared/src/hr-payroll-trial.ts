import type { FormalPayrollDefinition, FormalPayrollRole, FormalPayrollRunSelection, FormalPayrollTotals } from "./hr-payroll-formal";

export type PayrollTrialMapping = { modernCode: string; sourceItemVersionId: string };
export type PayrollTrialBookSelection = Pick<FormalPayrollRunSelection, "inputId" | "expectedInputVersion" | "attendanceInputBatchId" | "insuranceSources"> & {
  bookId: string; reconciliationSourceId: string; mappings: PayrollTrialMapping[];
};
export type PayrollTrialSelection = { legacyBatchId: string; month: string; books: PayrollTrialBookSelection[] };
export type PayrollTrialOptions = {
  periods: Array<{ legacyBatchId: string; batchCode: string; month: string; recordCount: number }>;
  legacyBatchId: string | null; month: string | null; recordCount: number; employeeCount: number;
  books: Array<{
    bookId: string; bookName: string; scheme: number; recordCount: number; employeeCount: number; unavailableCount: number; duplicateCount: number;
    sources: Array<{ id: string; sourceHash: string; recordCount: number; itemCount: number }>;
    inputs: Array<{ id: string; version: number; revisionNo: number; ruleVersionId: string; ruleName: string; employeeCount: number; definition: FormalPayrollDefinition }>;
    items: Array<{ id: string; code: string; name: string; versionNo: number; valueType: string }>;
  }>;
};
export type PayrollTrialLineStatus = "equal" | "different" | "unmapped" | "missing_source" | "source_null" | "nonnumeric" | "ambiguous_source" | "source_only" | "unknown_source";
export type PayrollTrialLine = {
  modernCode: string | null; role: FormalPayrollRole | null; sourceItemVersionId: string | null; sourceItemId: string | null;
  sourceName: string | null; modernValue: string | null; sourceValue: string | null; difference: string | null; status: PayrollTrialLineStatus;
};
export type PayrollTrialRecord = {
  bookId: string; bookName: string; sourceRecordId: string; employeeId: string; employeeCode: string; fullName: string;
  totals: FormalPayrollTotals; net: { modernValue: string; sourceValue: string | null; difference: string | null; status: "equal" | "different" | "missing_source" };
  lines: PayrollTrialLine[];
};
export type PayrollTrialResult = {
  kind: "calculate_only"; month: string; legacyBatchId: string; complete: true; calculatedAt: string;
  recordCount: number; employeeCount: number; bookCount: number; lineCount: number; comparableLineCount: number; differentLineCount: number;
  selectionHash: string; resultHash: string;
  evidence: Array<{ bookId: string; sourceId: string; sourceHash: string; bindingHash: string; inputId: string; inputVersion: number; inputHash: string; ruleVersionId: string; ruleHash: string; calculationHash: string; calculationVersion: string; formulaEngineVersion: string }>;
  records: PayrollTrialRecord[];
};
