import type {HrContract} from "../../../lib/hr-api";
import {csvDocument} from "../../../lib/scoped-csv-export";
import {formatContractCalendarDate} from "./contract-ledger";
export const contractStatusLabels:Record<string,string>={draft:"草稿",active:"履行中",expired:"已到期",terminated:"已终止",cancelled:"已取消",needs_review:"待复核"};
export function contractLedgerCsv(rows:readonly HrContract[],selfOnly:boolean){
 const headers=[...selfOnly?[]:["员工编号","姓名"],"合同编号","合同类型","开始日期","结束日期","试用期结束日期","合同状态"];
 return csvDocument([headers,...rows.map(row=>[...selfOnly?[]:[row.employeeCode,row.employeeName],row.contractNo,row.contractTypeName,formatContractCalendarDate(row.startDate,""),formatContractCalendarDate(row.endDate,""),formatContractCalendarDate(row.probationEndDate,""),contractStatusLabels[row.status]??row.status])]);
}
