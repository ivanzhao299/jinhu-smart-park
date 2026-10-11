export const HR_LEAVE_CANCELLATION_STATUSES = ["draft", "submitted", "returned", "approved", "cancelled"] as const;
export const HR_LEAVE_CANCELLATION_COMMANDS = ["submit", "withdraw", "approve", "return"] as const;
export type HrLeaveCancellationStatus = typeof HR_LEAVE_CANCELLATION_STATUSES[number];
export type HrLeaveCancellationCommand = typeof HR_LEAVE_CANCELLATION_COMMANDS[number];

export interface HrLeaveCancellationCreate {
  sourceRequestId: string;
  expectedSourceVersion: number;
  startAt: string;
  endAt: string;
  reason: string;
}
export interface HrLeaveCancellationUpdate {
  expectedVersion: number;
  startAt: string;
  endAt: string;
  reason: string;
}
export interface HrLeaveCancellationAction {
  expectedVersion: number;
  action: HrLeaveCancellationCommand;
  comment?: string;
}
export interface HrLeaveCancellationRecord {
  id: string;
  cancellationNo: string;
  sourceRequestId: string;
  sourceRequestNo: string;
  sourceRequestVersion: number;
  employeeId?: string;
  employeeCode?: string;
  employeeName?: string;
  startAt: string;
  endAt: string;
  reason: string;
  status: HrLeaveCancellationStatus;
  version: number;
  isSelf: boolean;
  actions: { edit: boolean; submit: boolean; withdraw: boolean; approve: boolean; return: boolean };
}
export interface HrLeaveCancellationSource {
  id: string;
  requestNo: string;
  employeeId?: string;
  employeeCode?: string;
  employeeName?: string;
  startAt: string;
  endAt: string;
  version: number;
}
export interface HrLeaveCancellationHistory {
  version: number;
  status: HrLeaveCancellationStatus;
  startAt: string;
  endAt: string;
  reason: string;
  action: "create" | "edit" | "submit" | "resubmit" | "withdraw" | "approve" | "return";
  comment: string | null;
  actorName: string;
  recordedAt: string;
}
