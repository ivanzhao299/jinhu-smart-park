import type { HrWorkforceDecisionSnapshot } from "../../../lib/hr-api";
import { csvDocument } from "../../../lib/scoped-csv-export";

type Department=HrWorkforceDecisionSnapshot["departments"][number];
type Position=HrWorkforceDecisionSnapshot["positions"][number];
const organizationStatusLabels:Record<string,string>={enabled:"启用",disabled:"停用",unassigned:"未归属"};
export const workforceOrganizationStatusLabel=(status:string)=>organizationStatusLabels[status]??status;

export function workforceDepartmentLedgerCsv(rows:readonly Department[]):string{
 return csvDocument([["部门编码","部门名称","组织状态","员工总数","在职","试用","待入职","停职","离职","组织编制"],...rows.map(row=>[row.code,row.name,workforceOrganizationStatusLabel(row.status),row.employeeTotal,row.activeCount,row.probationCount,row.preboardingCount,row.suspendedCount,row.departedCount,row.plannedHeadcount])]);
}

export function workforcePositionLedgerCsv(rows:readonly Position[]):string{
 return csvDocument([["组织编码","所属组织","岗位编码","岗位名称","岗位编制","在职及试用人数","可补编制","超编人数"],...rows.map(row=>[row.orgCode,row.orgName,row.positionCode,row.positionName,row.headcountLimit,row.activeHeadcount,row.vacancyCount,row.overCapacityCount])]);
}
