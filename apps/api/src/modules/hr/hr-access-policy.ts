import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { HrEmployeeProfileEntity } from "./entities/hr.entities";
import type { HrApprovalRequestEntity,HrFeedbackAssignmentEntity,HrGoalEntity,HrPayrollRunEntity,HrPayslipEntity,HrPerformancePlanEntity,HrWorkReportEntity } from "./entities/hr.entities";

export type HrEmployeeAccessScope = "park" | "managed_org_tree" | "self" | "none";
export interface HrContractAccessScope { park:boolean;managedOrgTree:boolean;self:boolean; }

export const HR_MANAGED_EMPLOYEE_IDS_SQL=`WITH RECURSIVE managed_org AS (
 SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND leader_user_id=$3 AND is_deleted=false AND status='enabled'
 UNION ALL
 SELECT child.id FROM sys_org child JOIN managed_org parent ON child.parent_id=parent.id
 WHERE child.tenant_id=$1 AND child.park_id=$2 AND child.is_deleted=false AND child.status='enabled'
)
SELECT DISTINCT employee.id FROM hr_employee employee
WHERE employee.tenant_id=$1 AND employee.park_id=$2 AND employee.is_deleted=false AND employee.id<>$4
 AND (employee.manager_employee_id=$4 OR employee.primary_org_id IN (SELECT id FROM managed_org))`;

export interface HrEmployeeProfileProjection {
  id: string;
  employeeId: string;
  idType: string | null;
  idNumberMasked: string | null;
  personalMobile: string | null;
  personalEmail: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactMobile: string | null;
  remark: string | null;
  masked: boolean;
}

export type HrPerformanceProjectionMode = "self" | "manager" | "admin";

export function projectHrGoal(row: HrGoalEntity) {
  const { id,cycleId,parentGoalId,goalLevel,goalName,ownerOrgId,ownerEmployeeId,weight,metricName,targetValue,currentValue,unit,progress,startDate,dueDate,status }=row;
  return {id,cycleId,parentGoalId,goalLevel,goalName,ownerOrgId,ownerEmployeeId,weight,metricName,targetValue,currentValue,unit,progress,startDate,dueDate,status};
}

export function projectHrWorkReport(row: HrWorkReportEntity) {
  const {id,employeeId,reportType,periodStart,periodEnd,completedWork,nextPlan,risks,collaborationNeeds,hours,status,reviewerEmployeeId,reviewComment,submittedAt,reviewedAt}=row;
  return {id,employeeId,reportType,periodStart,periodEnd,completedWork,nextPlan,risks,collaborationNeeds,hours,status,reviewerEmployeeId,reviewComment,submittedAt,reviewedAt};
}

export function projectHrPerformancePlan(row: HrPerformancePlanEntity, mode: HrPerformanceProjectionMode) {
  const confirmed=row.status==="confirmed"&&row.confirmedAt!==null;
  return {
    id:row.id,cycleId:row.cycleId,employeeId:row.employeeId,managerEmployeeId:row.managerEmployeeId,status:row.status,
    selfScore:row.selfScore,selfSummary:row.selfSummary,
    managerScore:mode==="self"&&!confirmed?null:row.managerScore,
    managerComment:mode==="self"&&!confirmed?null:row.managerComment,
    calibratedScore:mode==="admin"||confirmed?row.calibratedScore:null,
    finalScore:mode==="admin"||confirmed?row.finalScore:null,
    calibrationComment:mode==="admin"||confirmed?row.calibrationComment:null,
    confirmedAt:row.confirmedAt
  };
}

export function projectHrFeedbackAssignment(row: HrFeedbackAssignmentEntity) {
  const {id,feedbackCycleId,subjectEmployeeId,relationType,weight,status,submittedAt}=row;
  return {id,feedbackCycleId,subjectEmployeeId,relationType,weight,status,submittedAt};
}

export function projectHrPayrollRun(row: HrPayrollRunEntity) {
  const {id,periodId,runNo,correctionOfRunId,status,employeeCount,grossTotal,deductionTotal,netTotal,calculatedAt,reviewedAt,confirmedAt}=row;
  return {id,periodId,runNo,correctionOfRunId,status,employeeCount,grossTotal,deductionTotal,netTotal,calculatedAt,reviewedAt,confirmedAt};
}

export function projectHrPayslip(row: HrPayslipEntity, selfOnly: boolean) {
  const base={id:row.id,runId:row.runId,grossAmount:row.grossAmount,deductionAmount:row.deductionAmount,personalTax:row.personalTax,netAmount:row.netAmount,status:row.status,createTime:row.createTime};
  return selfOnly?base:{...base,employeeId:row.employeeId,compensationSnapshot:row.compensationSnapshot};
}

export function projectHrApproval(row: HrApprovalRequestEntity) {
  const {id,requestNo,requestType,applicantEmployeeId,subjectEmployeeId,title,payload,status,currentApproverId,submittedAt,completedAt}=row;
  return {id,requestNo,requestType,applicantEmployeeId,subjectEmployeeId,title,payload,status,currentApproverId,submittedAt,completedAt};
}

export function resolveHrEmployeeAccessScope(actor: JwtPrincipal): HrEmployeeAccessScope {
  if (actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_READ)) {
    return "park";
  }
  if (
    actor.permissions.includes(HR_PERMISSIONS.HR_WORK_REPORT_TEAM_REVIEW) ||
    actor.permissions.includes(HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW)
  ) {
    return "managed_org_tree";
  }
  if (actor.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ)) {
    return "self";
  }
  return "none";
}

export function resolveHrContractAccessScope(actor:JwtPrincipal):HrContractAccessScope {
  const all=actor.isSuper||actor.permissions.includes("*")||actor.permissions.includes(HR_PERMISSIONS.HR_CONTRACT_READ);
  return {
    park:all,
    managedOrgTree:!all&&actor.permissions.includes(HR_PERMISSIONS.HR_CONTRACT_TEAM_READ),
    self:!all&&actor.permissions.includes(HR_PERMISSIONS.HR_CONTRACT_SELF_READ)
  };
}

export type HrLedgerAccessScope="park"|"managed_org_tree"|"self"|"none";
export function resolveHrAttendanceAccessScope(actor:JwtPrincipal):HrLedgerAccessScope {
 if(actor.isSuper||actor.permissions.includes("*")||actor.permissions.includes(HR_PERMISSIONS.HR_ATTENDANCE_READ))return "park";
 if(actor.permissions.includes(HR_PERMISSIONS.HR_ATTENDANCE_TEAM_READ))return "managed_org_tree";
 if(actor.permissions.includes(HR_PERMISSIONS.HR_ATTENDANCE_SELF_READ))return "self";
 return "none";
}
export function resolveHrInsuranceAccessScope(actor:JwtPrincipal):HrLedgerAccessScope {
 if(actor.isSuper||actor.permissions.includes("*")||actor.permissions.includes(HR_PERMISSIONS.HR_INSURANCE_READ))return "park";
 if(actor.permissions.includes(HR_PERMISSIONS.HR_INSURANCE_TEAM_READ))return "managed_org_tree";
 if(actor.permissions.includes(HR_PERMISSIONS.HR_INSURANCE_SELF_READ))return "self";
 return "none";
}
export type HrPayrollHistoryAccessScope="park"|"self"|"none";
export function resolveHrPayrollHistoryAccessScope(actor:JwtPrincipal):HrPayrollHistoryAccessScope {
 if(actor.isSuper||actor.permissions.includes("*")||actor.permissions.includes(HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ))return "park";
 if(actor.permissions.includes(HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ))return "self";
 return "none";
}

export function isHrEmployeeIdAccessible(
  accessScope: HrEmployeeAccessScope,
  targetEmployeeId: string,
  selfEmployeeId: string,
  managedEmployeeIds: readonly string[]
): boolean {
  if (accessScope === "park") return true;
  if (accessScope === "self") return targetEmployeeId === selfEmployeeId;
  if (accessScope === "managed_org_tree") return managedEmployeeIds.includes(targetEmployeeId);
  return false;
}

export function projectHrEmployeeProfile(
  profile: HrEmployeeProfileEntity | null,
  canReadFull: boolean
): HrEmployeeProfileProjection | null {
  if (!profile) return null;
  return {
    id: profile.id,
    employeeId: profile.employeeId,
    idType: profile.idType,
    idNumberMasked: maskIdentity(profile.idNumberMasked),
    personalMobile: canReadFull ? profile.personalMobile : maskPhone(profile.personalMobile),
    personalEmail: canReadFull ? profile.personalEmail : maskEmail(profile.personalEmail),
    address: canReadFull ? profile.address : profile.address ? "***" : null,
    emergencyContactName: canReadFull ? profile.emergencyContactName : maskName(profile.emergencyContactName),
    emergencyContactMobile: canReadFull ? profile.emergencyContactMobile : maskPhone(profile.emergencyContactMobile),
    remark: canReadFull ? profile.remark : null,
    masked: !canReadFull
  };
}

function maskIdentity(value: string | null): string | null {
  if (!value) return null;
  if (value.includes("*")) return value;
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
}

function maskPhone(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function maskEmail(value: string | null): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  return `${value[0]}***${value.slice(at)}`;
}

function maskName(value: string | null): string | null {
  if (!value) return null;
  return value.length === 1 ? "*" : `${value[0]}${"*".repeat(value.length - 1)}`;
}
