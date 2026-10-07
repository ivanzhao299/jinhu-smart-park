import type { HrEmployee } from "../../../lib/hr-api";
import { EMPLOYEE_PAGE_SIZE } from "./employee-ledger";

export const employeeStatusLabels:Record<string,string>={preboarding:"待入职",probation:"试用期",active:"在职",suspended:"停职",departed:"已离职"};
export const employeeTypeLabels:Record<string,string>={full_time:"全职",part_time:"兼职",intern:"实习",contractor:"合同制",temporary:"临时工"};
export const EMPLOYEE_EXPORT_LIMIT=5000;
type Page={items:HrEmployee[];total:number;page:number;page_size:number};

/** A live directory export, not a database point-in-time snapshot. */
export async function collectEmployeeDirectory(fetchPage:(page:number,size:number)=>Promise<Page>,current:()=>boolean):Promise<HrEmployee[]|null>{
 const rows:HrEmployee[]=[],ids=new Set<string>();let total:number|undefined,first:Page|undefined;
 for(let page=1;;page++){
  const result=await fetchPage(page,EMPLOYEE_PAGE_SIZE);if(!current())return null;
  if(!Number.isSafeInteger(result.total)||result.total<0||result.page!==page||result.page_size!==EMPLOYEE_PAGE_SIZE||!Array.isArray(result.items))throw new Error("员工分页响应无效，请重新导出。");
  if(result.total>EMPLOYEE_EXPORT_LIMIT)throw new Error(`匹配员工超过 ${EMPLOYEE_EXPORT_LIMIT} 条，请缩小筛选范围后导出。`);
  if(total===undefined){total=result.total;first=result;}
  if(result.total!==total||result.items.length!==Math.min(EMPLOYEE_PAGE_SIZE,Math.max(0,total-(page-1)*EMPLOYEE_PAGE_SIZE)))throw new Error("员工目录在导出期间发生变化，请重新导出。");
  for(const row of result.items){if(typeof row?.id!=="string"||!row.id||ids.has(row.id))throw new Error("员工分页包含重复或无效记录，请重新导出。");ids.add(row.id);rows.push(row);}
  if(rows.length===total)break;
 }
 const final=await fetchPage(1,EMPLOYEE_PAGE_SIZE);if(!current())return null;
 if(final.total!==total||final.page!==1||final.page_size!==EMPLOYEE_PAGE_SIZE||JSON.stringify(final.items)!==JSON.stringify(first!.items))throw new Error("员工目录在导出期间发生变化，请重新导出。");
 return rows;
}

function csvCell(value:unknown){
 const text=value==null?"":String(value);
 // Quotes alone do not stop spreadsheet formula evaluation.
 let first=0;while(first<text.length&&(text.charCodeAt(first)<32||/\s/u.test(text[first]!)))first++;
 const safe=/^[=+@-]/u.test(text.slice(first))?`'${text}`:text;
 return `"${safe.replaceAll('"','""')}"`;
}
export function employeeDirectoryCsv(rows:readonly HrEmployee[]):string{
 const headers=["员工编号","姓名","用工类型","任职状态","工作地点","系统账号关联","入职日期","离职日期"];
 const records=rows.map(row=>[row.employeeCode,row.fullName,employeeTypeLabels[row.employmentType]??row.employmentType,employeeStatusLabels[row.employmentStatus]??row.employmentStatus,row.workLocation,row.userId?"已关联":"未关联",row.hireDate,row.departureDate]);
 return "\uFEFF"+[headers,...records].map(record=>record.map(csvCell).join(",")).join("\r\n");
}
export function downloadEmployeeDirectory(csv:string):void{
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 try{const anchor=document.createElement("a");anchor.href=url;anchor.download=`员工目录-${new Date().toISOString().slice(0,10)}.csv`;anchor.click();}
 finally{URL.revokeObjectURL(url);}
}
