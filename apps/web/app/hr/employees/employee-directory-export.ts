import type { HrEmployee } from "../../../lib/hr-api";
import {collectScopedExport,csvDocument,downloadCsv} from "../../../lib/scoped-csv-export";
import { EMPLOYEE_PAGE_SIZE } from "./employee-ledger";

export const employeeStatusLabels:Record<string,string>={preboarding:"待入职",probation:"试用期",active:"在职",suspended:"停职",departed:"已离职"};
export const employeeTypeLabels:Record<string,string>={full_time:"全职",part_time:"兼职",intern:"实习",contractor:"合同制",temporary:"临时工"};
export const EMPLOYEE_EXPORT_LIMIT=5000;
type Page={items:HrEmployee[];total:number;page:number;page_size:number};

/** A live directory export, not a database point-in-time snapshot. */
export function collectEmployeeDirectory(fetchPage:(page:number,size:number)=>Promise<Page>,current:()=>boolean){
 return collectScopedExport(fetchPage,current,{pageSize:EMPLOYEE_PAGE_SIZE,limit:EMPLOYEE_EXPORT_LIMIT,label:"员工"});
}

export function employeeDirectoryCsv(rows:readonly HrEmployee[]):string{
 const headers=["员工编号","姓名","用工类型","任职状态","工作地点","系统账号关联","入职日期","离职日期"];
 const records=rows.map(row=>[row.employeeCode,row.fullName,employeeTypeLabels[row.employmentType]??row.employmentType,employeeStatusLabels[row.employmentStatus]??row.employmentStatus,row.workLocation,row.userId?"已关联":"未关联",row.hireDate,row.departureDate]);
 return csvDocument([headers,...records]);
}
export function downloadEmployeeDirectory(csv:string):void{
 downloadCsv(csv,`员工目录-${new Date().toISOString().slice(0,10)}.csv`);
}
