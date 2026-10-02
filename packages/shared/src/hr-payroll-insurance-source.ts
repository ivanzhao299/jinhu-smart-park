export interface HrPayrollInsuranceChoice {
  employeeId: string; sourceKind: "historical" | "modern_confirmed"; sourceId: string;
  expectedVersion: number; expectedHash?: string;
}
export interface HrPayrollInsuranceSourceRequest {
  legacyBatchId: string; attendanceInputBatchId: string; reconciliationSourceId?: string;
}
export interface HrPayrollInsuranceSourcePage {
  items: Array<{ employeeId: string; employeeCode: string; fullName: string; options: HrPayrollInsuranceChoice[] }>;
  total: number; page: number; page_size: number; periodMonth: string;
}
