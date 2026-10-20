import type {HrEmployeeReminderGenerateInput, HrEmployeeReminderKind, HrEmployeeReminderLeapPolicy, HrEmployeeReminderRecipient} from "../../../lib/hr-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseReminderEntry(value: string | string[] | undefined) {
  if (value === undefined) return {reminderId: null, invalid: false};
  return typeof value === "string" && uuid.test(value)
    ? {reminderId: value, invalid: false}
    : {reminderId: null, invalid: true};
}

export function reminderIdFromMessage(target: string | null): string | null {
  if (!target?.startsWith("/hr/employee-reminders?")) return null;
  const query = new URL(target, "https://reminder.invalid").searchParams;
  const values = query.getAll("reminder");
  return values.length === 1 ? parseReminderEntry(values[0]).reminderId : null;
}

export function reminderGenerationInput(kind: HrEmployeeReminderKind, days: string, leap: "" | HrEmployeeReminderLeapPolicy, recipients: HrEmployeeReminderRecipient[]): HrEmployeeReminderGenerateInput | null {
  if (!/^\d+$/.test(days) || Number(days) > 365 || !leap || !recipients.length) return null;
  const ordered = (["hr", "manager", "employee"] as const).filter(value => recipients.includes(value));
  return {kind, windowDays: Number(days), leapDayPolicy: leap, recipients: ordered};
}

export const reminderKinds = {birthday: "生日", hire_anniversary: "入职周年"} as const;
export const reminderStates = {open: "待处理", read: "已读", acknowledged: "已确认", resolved: "已完成", cancelled: "已取消"} as const;
export const reminderLeaps = {skip: "非闰年跳过", feb_28: "非闰年按 2 月 28 日", mar_1: "非闰年按 3 月 1 日"} as const;
export const reminderActions = {read: "标记已读", acknowledge: "确认收到", resolve: "完成提醒", cancel: "取消提醒"} as const;
