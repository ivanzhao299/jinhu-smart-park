export const HR_LEAVE_BALANCE_BLOCKERS = [
 "opening_unknown", "schedule_coverage_incomplete", "source_coverage_incomplete",
 "approved_leave_undated", "leave_classification_incomplete", "leave_type_overlap",
] as const;
export type HrLeaveBalanceBlocker = typeof HR_LEAVE_BALANCE_BLOCKERS[number];
export interface HrLeaveType {
 id: string; typeCode: string; typeName: string; enabled: boolean; version: number;
}
export interface HrLeaveQuota {
 id: string; employeeId: string; leaveTypeId: string; periodStart: string; periodEnd: string;
 openingMinutes: number; adjustmentMinutes: number; version: number;
 employeeName?: string; employeeCode?: string; typeName?: string;
}
export interface HrLeaveBalanceEmployee {
 id: string; employeeCode: string; employeeName: string; isSelf: boolean;
}
export interface HrLeaveBalanceItem {
 leaveTypeId: string; typeCode: string; typeName: string; enabled: boolean;
 quotaId: string | null; quotaVersion: number | null;
 openingMinutes: number | null; adjustmentMinutes: number | null;
 observedMinutes: number; consumedMinutes: number | null; balanceMinutes: number | null;
 blockers: HrLeaveBalanceBlocker[];
}
export interface HrLeaveBalanceSources {
 restDays: Array<{ id: string; version: number; workDate: string; isRest: boolean }>;
 schedules: Array<{ id: string; version: number; workDate: string; shiftId: string; shiftVersion: number | null }>;
 requests: Array<{ id: string; version: number; requestNo: string; leaveTypeId: string | null; leaveTypeVersion: number | null }>;
 cancellations: Array<{ id: string; version: number; cancellationNo: string; sourceRequestId: string }>;
 quotas: Array<{ id: string; version: number; leaveTypeId: string }>;
}
export interface HrLeaveBalanceReport {
 employee: HrLeaveBalanceEmployee;
 from: string; to: string; timezone: "Asia/Shanghai";
 observedAt: string; basis: "registered_system_facts"; basisHash: string;
 missingScheduleDates: string[]; unclassifiedMinutes: number; undatedApprovedRequestCount: number;
 sources: HrLeaveBalanceSources;
 items: HrLeaveBalanceItem[]; total: number; page: number; page_size: number;
}
