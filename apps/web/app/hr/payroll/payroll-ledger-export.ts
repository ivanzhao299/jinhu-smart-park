import type {HrPayrollHistoryRow} from "../../../lib/hr-api";
import {collectScopedExport,csvDocument,downloadCsv,type ExportPage} from "../../../lib/scoped-csv-export";

export const PAYROLL_EXPORT_LIMIT=5000;
export const PAYROLL_EXPORT_PAGE_SIZE=100;
export function collectPayrollLedger(fetchPage:(page:number,size:number)=>Promise<ExportPage<HrPayrollHistoryRow>>,current:()=>boolean){
  return collectScopedExport(fetchPage,current,{pageSize:PAYROLL_EXPORT_PAGE_SIZE,limit:PAYROLL_EXPORT_LIMIT,label:"工资记录"});
}
export function payrollLedgerCsv(rows:readonly HrPayrollHistoryRow[],selfOnly:boolean):string{
  const identity=selfOnly?[]:["员工编号","姓名"];
  const headers=[...identity,"月份","账套","应发","扣款","税额","实发",...(selfOnly?[]:["员工可见"])];
  const records=rows.map(row=>[...(selfOnly?[]:[row.employeeCode,row.employeeName]),row.periodMonth.slice(0,7),row.bookName||`账套 ${row.legacyScheme}`,row.grossAmount,row.deductionAmount,row.taxAmount,row.netAmount,...(selfOnly?[]:[row.publicationStatus==="published"?"是":"否"])]);
  return csvDocument([headers,...records]);
}
export function downloadPayrollLedger(csv:string):void{
  downloadCsv(csv,`工资台账-${new Date().toISOString().slice(0,10)}.csv`);
}
