import type { PaginatedResult } from "./index";
export const FORMAL_PAYROLL_ROLES = ["earning", "deduction", "tax", "gross", "net", "employer_contribution", "informational"] as const;
export type FormalPayrollRole = typeof FORMAL_PAYROLL_ROLES[number];
export type FormalPayrollItem = { code: string; role: FormalPayrollRole; expression: string | null };
export const FORMAL_PAYROLL_COMPENSATION_POLICIES = ["full_period_single", "calendar_day_prorated"] as const;
export type FormalPayrollCompensationPolicy = typeof FORMAL_PAYROLL_COMPENSATION_POLICIES[number];
export type FormalPayrollDefinition = { roundingPolicy: "line_items_half_up"; compensationPolicy?: FormalPayrollCompensationPolicy; items: readonly FormalPayrollItem[] };
export type FormalPayrollPage<T> = PaginatedResult<T>;
export type FormalPayrollRuleSet = { id: string; ruleCode: string; displayName: string; sourceBookId: string | null; headRevision: number };
export type FormalPayrollRuleVersion = {
  id: string; ruleSetId: string; revisionNo: number; version: number; status: string;
  definition: FormalPayrollDefinition; reason: string; effectiveFrom: string | null; reviewReason: string | null;
};
export type FormalPayrollEmployeeInput = {
  employeeId: string; expectedEmployeeVersion: number; directItems: Record<string, string>; eligibilityReason?: string;
  settlementStart?: string; settlementEnd?: string;
};
export type FormalPayrollInput = {
  id: string; periodId: string; ruleSetId: string; ruleVersionId: string; revisionNo: number; version: number;
  status: string; employees: FormalPayrollEmployeeInput[]; reason: string;
};
export type FormalPayrollInputListItem = Omit<FormalPayrollInput, "employees" | "reason"> & { displayName: string; employeeCount: number };
export type FormalPayrollInputDetail = Omit<FormalPayrollInput, "employees"> & {
  employees: Array<FormalPayrollEmployeeInput & { fullName: string | null; employeeCode: string | null }>;
  total: number; page: number; page_size: number; canEdit: boolean; canConfirm: boolean;
};
export type FormalPayrollTotals = { grossAmount: string; deductionAmount: string; personalTax: string; netAmount: string };
export type FormalPayrollRunSelection = {
  inputId: string; expectedInputVersion: number; attendanceInputBatchId?: string;
  correctionOfRunId?: string; correctionReason?: string;
  insuranceSources?: Array<{ employeeId: string; sourceKind: "modern_confirmed"; sourceId: string; expectedVersion: number; expectedHash: string }>;
};
export type FormalPayrollRunResult = FormalPayrollTotals & { id: string; periodId: string; runNo: number; version: number; status: string; employeeCount: number };
export type FormalPayrollRunListItem = { id: string; periodId: string; runNo: number; version: number; status: string; employeeCount: number; isCorrection: boolean; month: string; ruleName: string };
export type FormalPayrollRunDetail = FormalPayrollPage<FormalPayrollTotals & {
  employeeId: string; employeeCode: string | null; fullName: string | null;
  calculationVersion: string; formulaEngineVersion: string; roundingPolicy: "line_items_half_up";
  items: Array<{ code: string; role: FormalPayrollRole; decimalValue: string; amount: string | null }>;
}> & {
  id: string; periodId: string; runNo: number; version: number; status: string; inputId: string; ruleVersionId: string;
  employeeCount: number; totals: FormalPayrollTotals; canReview: boolean; canConfirm: boolean;
};

export type FormalPayrollPreparation = FormalPayrollPage<{
  employeeId:string;expectedEmployeeVersion:number;employeeCode:string;fullName:string;
  hireDate:string|null;departureDate:string|null;requiresSettlementWindow:boolean;
  eligibility:{eligibleStart:string;eligibleEnd:string;basis:"employment_dates"}|null;
}> & {period:{id:string;month:string;startDate:string;endDate:string};
  rule:{id:string;ruleSetId:string;displayName:string;definition:FormalPayrollDefinition};expectedHeadRevision:number};

export type FormalPayrollRunOptions = FormalPayrollPage<{
  employeeId:string;employeeCode:string;fullName:string;
  insuranceSource:NonNullable<FormalPayrollRunSelection["insuranceSources"]>[number]|null;
}> & {inputId:string;inputVersion:number;periodId:string;month:string;employeeCount:number;
  requires:{compensation:boolean;attendance:boolean;insurance:boolean};canCreateBase:boolean;overlappingEmployeeCount:number;
  attendanceBatches:Array<{id:string;batchNo:number;batchType:string;missingEmployeeCount:number}>;
  correctionRuns:Array<{id:string;runNo:number;employeeCount:number}>;};
