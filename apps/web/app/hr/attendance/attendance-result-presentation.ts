export const attendanceResultStatuses={normal:"正常",late:"迟到",early_leave:"早退",missing_punch:"缺卡",absence:"缺勤",rest:"休息",corrected:"已更正"};
export function attendanceResultStatusLabel(status:string){return Object.prototype.hasOwnProperty.call(attendanceResultStatuses,status)?attendanceResultStatuses[status as keyof typeof attendanceResultStatuses]:`未识别状态：${status}`;}
