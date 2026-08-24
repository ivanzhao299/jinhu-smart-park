import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "./api-client";
export interface HrEmployee {id:string;employeeCode:string;fullName:string;userId:string|null;primaryOrgId:string|null;positionId:string|null;managerEmployeeId:string|null;employmentType:string;employmentStatus:string;hireDate:string|null;departureDate:string|null;workLocation:string|null;workMobile:string|null;workEmail:string|null;}
export interface HrPosition {id:string;orgId:string;positionCode:string;positionName:string;jobFamily:string|null;jobLevel:string|null;headcountLimit:number|null;status:string;}
export interface HrEmploymentEvent {id:string;eventType:string;effectiveDate:string;reason:string|null;createTime:string;}
export interface HrEmployeeProfile {id:string;employeeId:string;idType:string|null;idNumberMasked:string|null;personalMobile:string|null;personalEmail:string|null;address:string|null;emergencyContactName:string|null;emergencyContactMobile:string|null;remark:string|null;}
export interface HrGoalCycle {id:string;cycleCode:string;cycleName:string;startDate:string;endDate:string;status:string;}
export interface HrGoal {id:string;cycleId:string;parentGoalId:string|null;goalLevel:string;goalName:string;ownerOrgId:string|null;ownerEmployeeId:string|null;weight:string;metricName:string|null;targetValue:string|null;currentValue:string|null;unit:string|null;progress:string;startDate:string;dueDate:string;status:string;}
export interface HrGoalCheckin {id:string;goalId:string;progress:string;currentValue:string|null;summary:string;risks:string|null;createTime:string;}
export interface HrWorkReport {id:string;employeeId:string;reportType:string;periodStart:string;periodEnd:string;completedWork:string;nextPlan:string|null;risks:string|null;collaborationNeeds:string|null;hours:string|null;status:string;reviewComment:string|null;}
export interface HrPerformanceCycle {id:string;cycleCode:string;cycleName:string;startDate:string;endDate:string;status:string;}
export interface HrPerformancePlan {id:string;cycleId:string;employeeId:string;managerEmployeeId:string|null;status:string;selfScore:string|null;managerScore:string|null;calibratedScore:string|null;finalScore:string|null;selfSummary:string|null;managerComment:string|null;calibrationComment:string|null;}
export interface HrFeedbackAssignment {id:string;feedbackCycleId:string;subjectEmployeeId:string;reviewerEmployeeId:string;relationType:string;weight:string;status:string;}
export interface HrFeedbackCycle {id:string;performanceCycleId:string;cycleName:string;anonymous:boolean;minimumAnonymousResponses:number;status:string;}
export interface HrCompensationPlan {id:string;planCode:string;planName:string;effectiveFrom:string;effectiveTo:string|null;status:string;currency:string;}
export interface HrPayrollPeriod {id:string;periodMonth:string;startDate:string;endDate:string;status:string;}
export interface HrPayrollRun {id:string;periodId:string;runNo:number;correctionOfRunId:string|null;status:string;employeeCount:number;grossTotal:string;deductionTotal:string;netTotal:string;}
export interface HrPayslip {id:string;runId:string;employeeId:string;grossAmount:string;deductionAmount:string;personalTax:string;netAmount:string;status:string;createTime:string;}
export interface HrApproval {id:string;requestNo:string;requestType:string;applicantEmployeeId:string;subjectEmployeeId:string;title:string;payload:Record<string,unknown>;status:string;submittedAt:string|null;completedAt:string|null;}
export interface HrContract {id:string;employeeId?:string;employeeCode?:string;employeeName?:string;contractNo:string;contractTypeId?:string;contractTypeName:string;startDate:string|null;endDate:string|null;probationEndDate?:string|null;status:string;isHistoricalImport:boolean;}
export interface HrContractChange {id:string;sequenceNo:number;changeType:string;previousStartDate:string|null;previousEndDate:string|null;newStartDate:string;newEndDate:string|null;status:string;isHistoricalImport:boolean;}
export interface HrContractDetail extends HrContract {changes:HrContractChange[];}
export interface HrContractType {id:string;typeCode:string;typeName:string;isHistoricalImport:boolean;}
export interface HrEmployeeListFilters {keyword?:string;status?:string;}
export interface HrContractListFilters {keyword?:string;status?:string;expiryFrom?:string;expiryTo?:string;}
async function unwrap<T>(p:Promise<{data:T}>){return (await p).data;}
export const hrApi={
 employees:(token?:string,page=1,pageSize=100,filters:HrEmployeeListFilters={})=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.keyword)query.set("keyword",filters.keyword);if(filters.status)query.set("status",filters.status);return unwrap(apiRequest<PaginatedResult<HrEmployee>>(`/hr/employees?${query.toString()}`,{token}));},
 me:(token?:string)=>unwrap(apiRequest<HrEmployee>("/hr/employees/me",{token,skipUnauthorizedReset:true})),
 createEmployee:(body:object,token?:string)=>unwrap(apiRequest<HrEmployee>("/hr/employees",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()})),
 employee:(id:string,token?:string)=>unwrap(apiRequest<HrEmployee>(`/hr/employees/${id}`,{token})),
 updateEmployee:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrEmployee>(`/hr/employees/${id}`,{method:"PUT",body,token,idempotencyKey:crypto.randomUUID()})),
 events:(id:string,token?:string)=>unwrap(apiRequest<HrEmploymentEvent[]>(`/hr/employees/${id}/events`,{token})),
 profile:(id:string,token?:string)=>unwrap(apiRequest<HrEmployeeProfile|null>(`/hr/employees/${id}/profile`,{token})),
 updateProfile:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrEmployeeProfile>(`/hr/employees/${id}/profile`,{method:"PUT",body,token,idempotencyKey:crypto.randomUUID()})),
 transition:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrEmployee>(`/hr/employees/${id}/transitions`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()})),
 positions:(token?:string)=>unwrap(apiRequest<HrPosition[]>("/hr/positions",{token})),
 createPosition:(body:object,token?:string)=>unwrap(apiRequest<HrPosition>("/hr/positions",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,contracts:(token?:string,page=1,pageSize=20,filters:HrContractListFilters={},selfOnly=false)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.keyword)query.set("keyword",filters.keyword);if(filters.status)query.set("status",filters.status);if(filters.expiryFrom)query.set("expiry_from",filters.expiryFrom);if(filters.expiryTo)query.set("expiry_to",filters.expiryTo);return unwrap(apiRequest<PaginatedResult<HrContract>>(`/hr/contracts${selfOnly?"/me":""}?${query.toString()}`,{token}));}
 ,contract:(id:string,token?:string)=>unwrap(apiRequest<HrContractDetail>(`/hr/contracts/${id}`,{token}))
 ,contractTypes:(token?:string)=>unwrap(apiRequest<HrContractType[]>("/hr/contract-types",{token}))
 ,createContract:(body:object,token?:string)=>unwrap(apiRequest<HrContract>("/hr/contracts",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,contractAction:(id:string,action:"activate"|"cancel",token?:string)=>unwrap(apiRequest<HrContract>(`/hr/contracts/${id}/actions`,{method:"POST",body:{action},token,idempotencyKey:crypto.randomUUID()}))
 ,createContractChange:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrContractChange>(`/hr/contracts/${id}/changes`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,contractChangeAction:(contractId:string,changeId:string,action:"apply"|"cancel",token?:string)=>unwrap(apiRequest<HrContractChange>(`/hr/contracts/${contractId}/changes/${changeId}/actions`,{method:"POST",body:{action},token,idempotencyKey:crypto.randomUUID()}))
 ,goalCycles:(token?:string)=>unwrap(apiRequest<HrGoalCycle[]>("/hr/goal-cycles",{token}))
 ,createGoalCycle:(body:object,token?:string)=>unwrap(apiRequest<HrGoalCycle>("/hr/goal-cycles",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,goals:(selfOnly:boolean,token?:string)=>unwrap(apiRequest<HrGoal[]>(selfOnly?"/hr/goals/me":"/hr/goals",{token}))
 ,createGoal:(body:object,token?:string)=>unwrap(apiRequest<HrGoal>("/hr/goals",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,goalCheckins:(id:string,token?:string)=>unwrap(apiRequest<HrGoalCheckin[]>(`/hr/goals/${id}/checkins`,{token}))
 ,createGoalCheckin:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrGoalCheckin>(`/hr/goals/${id}/checkins`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,myWorkReports:(token?:string)=>unwrap(apiRequest<HrWorkReport[]>("/hr/work-reports/me",{token}))
 ,createWorkReport:(body:object,token?:string)=>unwrap(apiRequest<HrWorkReport>("/hr/work-reports/me",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,teamWorkReports:(token?:string)=>unwrap(apiRequest<HrWorkReport[]>("/hr/work-reports/team",{token}))
 ,reviewWorkReport:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrWorkReport>(`/hr/work-reports/${id}/review`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,performanceCycles:(token?:string)=>unwrap(apiRequest<HrPerformanceCycle[]>("/hr/performance/cycles",{token}))
 ,createPerformanceCycle:(body:object,token?:string)=>unwrap(apiRequest<HrPerformanceCycle>("/hr/performance/cycles",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,createPerformancePlan:(body:object,token?:string)=>unwrap(apiRequest<HrPerformancePlan>("/hr/performance/plans",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,myPerformancePlans:(token?:string)=>unwrap(apiRequest<HrPerformancePlan[]>("/hr/performance/plans/me",{token}))
 ,teamPerformancePlans:(token?:string)=>unwrap(apiRequest<HrPerformancePlan[]>("/hr/performance/plans/team",{token}))
 ,selfReviewPerformance:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrPerformancePlan>(`/hr/performance/plans/${id}/self-review`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,managerReviewPerformance:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrPerformancePlan>(`/hr/performance/plans/${id}/manager-review`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,calibratePerformance:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrPerformancePlan>(`/hr/performance/plans/${id}/calibrate`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,createFeedbackCycle:(body:object,token?:string)=>unwrap(apiRequest<{id:string}>("/hr/feedback/cycles",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,feedbackCycles:(token?:string)=>unwrap(apiRequest<HrFeedbackCycle[]>("/hr/feedback/cycles",{token}))
 ,createFeedbackAssignment:(body:object,token?:string)=>unwrap(apiRequest<HrFeedbackAssignment>("/hr/feedback/assignments",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,myFeedbackAssignments:(token?:string)=>unwrap(apiRequest<HrFeedbackAssignment[]>("/hr/feedback/assignments/me",{token}))
 ,submitFeedback:(id:string,body:object,token?:string)=>unwrap(apiRequest<{id:string}>(`/hr/feedback/assignments/${id}/submit`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,compensationPlans:(token?:string)=>unwrap(apiRequest<HrCompensationPlan[]>("/hr/compensation/plans",{token}))
 ,createCompensationPlan:(body:object,token?:string)=>unwrap(apiRequest<HrCompensationPlan>("/hr/compensation/plans",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,assignCompensation:(body:object,token?:string)=>unwrap(apiRequest<{id:string}>("/hr/compensation/assignments",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,payrollPeriods:(token?:string)=>unwrap(apiRequest<HrPayrollPeriod[]>("/hr/payroll/periods",{token}))
 ,createPayrollPeriod:(body:object,token?:string)=>unwrap(apiRequest<HrPayrollPeriod>("/hr/payroll/periods",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,payrollRuns:(token?:string)=>unwrap(apiRequest<HrPayrollRun[]>("/hr/payroll/runs",{token}))
 ,payrollRunPayslips:(id:string,token?:string)=>unwrap(apiRequest<HrPayslip[]>(`/hr/payroll/runs/${id}/payslips`,{token}))
 ,adjustPayslip:(runId:string,payslipId:string,body:object,token?:string)=>unwrap(apiRequest<HrPayslip>(`/hr/payroll/runs/${runId}/payslips/${payslipId}`,{method:"PUT",body,token,idempotencyKey:crypto.randomUUID()}))
 ,createPayrollRun:(body:object,token?:string)=>unwrap(apiRequest<HrPayrollRun>("/hr/payroll/runs",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,reviewPayrollRun:(id:string,token?:string)=>unwrap(apiRequest<HrPayrollRun>(`/hr/payroll/runs/${id}/review`,{method:"POST",token,idempotencyKey:crypto.randomUUID()}))
 ,confirmPayrollRun:(id:string,token?:string)=>unwrap(apiRequest<HrPayrollRun>(`/hr/payroll/runs/${id}/confirm`,{method:"POST",token,idempotencyKey:crypto.randomUUID()}))
 ,myPayslips:(token?:string)=>unwrap(apiRequest<HrPayslip[]>("/hr/payslips/me",{token}))
 ,myApprovals:(token?:string)=>unwrap(apiRequest<HrApproval[]>("/hr/approvals/me",{token}))
 ,pendingApprovals:(token?:string)=>unwrap(apiRequest<HrApproval[]>("/hr/approvals/pending",{token}))
 ,createApproval:(body:object,token?:string)=>unwrap(apiRequest<HrApproval>("/hr/approvals",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,approvalAction:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrApproval>(`/hr/approvals/${id}/actions`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,reviewApproval:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrApproval>(`/hr/approvals/${id}/review`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
};
