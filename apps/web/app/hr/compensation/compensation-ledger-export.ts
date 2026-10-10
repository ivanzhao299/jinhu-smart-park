import type { HrCompensationAssignment } from "../../../lib/hr-api";
import {csvDocument} from "../../../lib/scoped-csv-export";
import {validCompensationAssignment} from "./compensation-contract";

const snapshotTimestamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const compensationStatusLabels:Record<string,string>={active:"启用",inactive:"停用",draft:"草稿",void:"作废",superseded:"已替代"};
const headers=["员工编号","员工姓名","方案编号","方案名称","生效日期","截止日期","基本工资","津贴","目标浮动薪资","状态","版本"];

export function compensationLedgerExportCsv(result:unknown):{csv:string;total:number}{
 if(!result||typeof result!=="object")throw new Error("定薪导出响应无法核对，请重新读取。");
 const value=result as {items?:unknown;total?:unknown;snapshotAt?:unknown};
 const total=value.total;
 if(!Array.isArray(value.items)||typeof total!=="number"||!Number.isSafeInteger(total)||total<0||total!==value.items.length||total>5000||new Set(value.items.map(row=>(row as {id?:unknown})?.id)).size!==value.items.length||!value.items.every(validCompensationAssignment)||typeof value.snapshotAt!=="string"||(!snapshotTimestamp.test(value.snapshotAt)||!Number.isFinite(Date.parse(value.snapshotAt))||new Date(value.snapshotAt).toISOString()!==value.snapshotAt))throw new Error("定薪导出响应无法核对，请重新读取。");
 const items=value.items as HrCompensationAssignment[];
 return {total,csv:csvDocument([headers,...items.map(row=>[row.employeeCode,row.employeeName,row.planCode,row.planName,row.effectiveFrom,row.effectiveTo,row.baseSalary,row.allowanceAmount,row.variableTarget,compensationStatusLabels[row.status]??row.status,row.version])])};
}
