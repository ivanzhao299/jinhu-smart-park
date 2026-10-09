import type {HrInsurancePeriod} from "../../../lib/hr-api";
import {csvDocument} from "../../../lib/scoped-csv-export";
export const insuranceReviewReasonLabels:Record<string,string>={T3_INT4_INVALID:"来源期间缺失或无效",T3_RECORD_NEEDS_REVIEW:"来源记录待复核"};
export function insuranceLedgerCsv(rows:readonly HrInsurancePeriod[],access:{selfOnly:boolean;showAmounts:boolean;full:boolean}){
 const {selfOnly,showAmounts}=access,employer=showAmounts&&access.full&&!selfOnly;
 const headers=[...selfOnly?[]:["员工编号","姓名"],"年份","月份","险种数","复核状态",...showAmounts?["个人缴费","补充缴费"]:[],...employer?["单位缴费","缴费合计"]:[]];
 return csvDocument([headers,...rows.map(row=>[...selfOnly?[]:[row.employeeCode,row.employeeName],Number.isInteger(row.periodYear)&&row.periodYear>=1900&&row.periodYear<=2200?row.periodYear:null,Number.isInteger(row.periodMonth)&&row.periodMonth>=1&&row.periodMonth<=12?row.periodMonth:null,row.itemCount,row.needsReview?insuranceReviewReasonLabels[row.reviewReasonCode??""]??"待复核":"已入账",...showAmounts?[row.employeeAmount,row.supplementAmount]:[],...employer?[row.employerAmount,row.totalAmount]:[]])]);
}
