import { HR_ACCESS_MATRIX,HR_PERMISSIONS,resolveHrAccessScope,type HrAccessScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { HrEmployeeProfileEntity } from "./entities/hr.entities";
import type { HrApprovalRequestEntity,HrFeedbackAssignmentEntity,HrGoalEntity,HrPayrollRunEntity,HrPayslipEntity,HrPerformancePlanEntity,HrWorkReportEntity } from "./entities/hr.entities";

export type HrEmployeeAccessScope = HrAccessScope;
export type HrApprovalReviewAccessScope = Exclude<HrAccessScope,"self">;
export interface HrContractAccessScope { park:boolean;managedOrgTree:boolean;self:boolean; }
export type HrEmployeeProfileProjectionMode="full"|"masked"|"self_masked";
export interface HrEmployeeProfileAccess {scope:HrEmployeeAccessScope;projection:HrEmployeeProfileProjectionMode|null;}

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
  idNumber?: string | null;
  idNumberMasked: string | null;
  englishName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  ethnicity?: string | null;
  nativePlace?: string | null;
  politicalStatus?: string | null;
  partyJoinDate?: string | null;
  heightCm?: string | null;
  weightKg?: string | null;
  maritalStatus?: string | null;
  healthStatus?: string | null;
  householdRegistration?: string | null;
  highestEducation?: string | null;
  major?: string | null;
  degree?: string | null;
  foreignLanguage?: string | null;
  languageLevel?: string | null;
  graduationDate?: string | null;
  graduationSchool?: string | null;
  homePhone?: string | null;
  jobTitle: string | null;
  jobGrade: string | null;
  employeeCategory: string | null;
  technicalTitle: string | null;
  technicalGrade: string | null;
  personalMobile: string | null;
  personalEmail: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactMobile: string | null;
  remark?: string | null;
  masked: boolean;
}

export type HrPerformanceProjectionMode = "self" | "manager" | "admin";

export function projectHrGoal(row: HrGoalEntity) {
  const { id,cycleId,parentGoalId,goalLevel,goalName,ownerOrgId,ownerEmployeeId,weight,metricName,targetValue,currentValue,unit,progress,startDate,dueDate,status }=row;
  return {id,cycleId,parentGoalId,goalLevel,goalName,ownerOrgId,ownerEmployeeId,weight,metricName,targetValue,currentValue,unit,progress,startDate,dueDate,status};
}

export function projectHrWorkReport(row: HrWorkReportEntity) {
  const {id,employeeId,reportType,periodStart,periodEnd,title,completedWork,nextPlan,risks,questionsAndSuggestions,collaborationNeeds,hours,status,reviewerEmployeeId,reviewComment,submittedAt,reviewedAt}=row;
  return {id,employeeId,reportType,periodStart,periodEnd,title,completedWork,nextPlan,risks,questionsAndSuggestions,collaborationNeeds,hours,status,reviewerEmployeeId,reviewComment,submittedAt,reviewedAt};
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
  return selfOnly?base:{...base,employeeId:row.employeeId};
}

export function projectHrApproval(row: HrApprovalRequestEntity) {
  const {id,requestNo,requestType,applicantEmployeeId,subjectEmployeeId,title,payload,status,currentApproverId,submittedAt,completedAt}=row;
  return {id,requestNo,requestType,applicantEmployeeId,subjectEmployeeId,title,payload,status,currentApproverId,submittedAt,completedAt};
}

export function resolveHrEmployeeAccessScope(actor: JwtPrincipal): HrEmployeeAccessScope {
  return resolveHrAccessScope("employee",actor);
}

export function resolveHrApprovalReviewAccessScope(actor:JwtPrincipal):HrApprovalReviewAccessScope {
  return resolveHrAccessScope("approval_review",actor) as HrApprovalReviewAccessScope;
}

export function resolveHrEmployeeProfileAccess(actor:JwtPrincipal):HrEmployeeProfileAccess {
  const scope=resolveHrAccessScope("employee_profile",actor);
  if(scope==="none")return {scope,projection:null};
  if(scope==="park"){
    const canReadFull=actor.isSuper||actor.permissions.includes("*")||actor.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE);
    return {scope,projection:canReadFull?"full":"masked"};
  }
  if(scope===HR_ACCESS_MATRIX.DEPARTMENT_MANAGER.employeeScope)return {scope,projection:HR_ACCESS_MATRIX.DEPARTMENT_MANAGER.sensitiveProfile};
  return {scope,projection:HR_ACCESS_MATRIX.EMPLOYEE_SELF_SERVICE.sensitiveProfile};
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
  projection: HrEmployeeProfileProjectionMode
): HrEmployeeProfileProjection | null {
  if (!profile) return null;
  const full=projection==="full";
  const base={
    id: profile.id,
    employeeId: profile.employeeId,
    idType: profile.idType,
    idNumberMasked: maskIdentity(profile.idNumberMasked),
    jobTitle: profile.jobTitle??null,
    jobGrade: profile.jobGrade??null,
    employeeCategory: profile.employeeCategory??null,
    technicalTitle: profile.technicalTitle??null,
    technicalGrade: profile.technicalGrade??null,
    personalMobile: full ? profile.personalMobile : maskPhone(profile.personalMobile),
    personalEmail: full ? profile.personalEmail : maskEmail(profile.personalEmail),
    address: full ? profile.address : profile.address ? "***" : null,
    emergencyContactName: full ? profile.emergencyContactName : maskName(profile.emergencyContactName),
    emergencyContactMobile: full ? profile.emergencyContactMobile : maskPhone(profile.emergencyContactMobile),
    masked: !full,
  };
  if(!full)return base;
  return {...base,
    englishName:profile.englishName??null,gender:profile.gender??null,dateOfBirth:profile.dateOfBirth??null,
    ethnicity:profile.ethnicity??null,nativePlace:profile.nativePlace??null,politicalStatus:profile.politicalStatus??null,
    partyJoinDate:profile.partyJoinDate??null,heightCm:profile.heightCm??null,weightKg:profile.weightKg??null,
    maritalStatus:profile.maritalStatus??null,healthStatus:profile.healthStatus??null,
    householdRegistration:profile.householdRegistration??null,highestEducation:profile.highestEducation??null,
    major:profile.major??null,degree:profile.degree??null,foreignLanguage:profile.foreignLanguage??null,
    languageLevel:profile.languageLevel??null,graduationDate:profile.graduationDate??null,
    graduationSchool:profile.graduationSchool??null,homePhone:profile.homePhone??null,remark:profile.remark??null,
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
