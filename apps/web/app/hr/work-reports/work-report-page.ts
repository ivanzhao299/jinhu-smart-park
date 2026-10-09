import type {HrWorkReportPage} from "../../../lib/hr-api";
export const emptyWorkReportPage=(page=1):HrWorkReportPage=>({items:[],total:0,page,page_size:20,summary:{pending:0,returned:0}});
export function assertWorkReportPage(data:HrWorkReportPage,page:number):void {
 if(!data||data.page!==page||data.page_size!==20||!Number.isSafeInteger(data.total)||data.total<0||!data.summary||![data.summary.pending,data.summary.returned].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=data.total)||!Array.isArray(data.items)||data.items.length!==Math.max(0,Math.min(20,data.total-(page-1)*20))||data.items.some(row=>!row||typeof row.id!=="string"||!["daily","weekly","monthly"].includes(row.reportType)||!["draft","submitted","resubmitted","confirmed","returned"].includes(row.status)||typeof row.periodStart!=="string"||typeof row.periodEnd!=="string"||typeof row.completedWork!=="string"||!Array.isArray(row.goalSuggestions)))throw new Error("工作汇报分页响应无效，请重新读取。");
}
