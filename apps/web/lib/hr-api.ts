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
export interface HrPayrollHistoryRow {id:string;periodMonth:string;legacyScheme:string;bookName:string|null;employeeCode?:string;employeeName?:string;grossAmount:string|null;deductionAmount:string|null;taxAmount:string|null;netAmount:string|null;publicationStatus:string;}
export interface HrPayrollHistoryItem {id:string;itemCode:string|null;displayName:string|null;valueType:"decimal"|"text"|"date"|string;isSourceNull:boolean;decimalValue:string|null;textValue:string|null;dateValue:string|null;sortNo:number;}
export interface HrPayrollBook {id:string;legacyScheme:string;bookName:string|null;status:string;}
export interface HrPayrollCatalogItem {id:string;bookId:string;itemCode:string;displayName:string;valueType:string;itemCategory:string;decimalScale:number;sortNo:number;taxable:boolean;printEnabled:boolean;enabled:boolean;}
export interface HrPayrollFormula {id:string;bookId:string;legacyScheme:string;itemName:string|null;parseStatus:"parsed"|"manual_review"|"rejected"|"approved_for_simulation";dependencyCodes:string[];calculationOrder:number;reviewedAt:string|null;reviewReason:string|null;}
export interface HrPayrollReviewAction {id:string;reviewCaseId?:string;sequenceNo:number;action:"comment"|"resolve"|"reject";decision:"needs_follow_up"|"accepted_exception"|"mapping_confirmed"|"unsafe_rejected";comment:string;createdAt:string;}
export interface HrPayrollReviewCase {id:string;caseType:string;evidenceSummary:Record<string,unknown>;sourceStatus:string;createdAt:string;actionCount?:number;latestSequence?:number|null;actions?:HrPayrollReviewAction[];}
export interface HrPayrollHistoryFilters {periodFrom?:string;periodTo?:string;bookId?:string;employeeId?:string;}
export interface HrPayrollCatalogFilters {bookId?:string;parseStatus?:string;status?:string;caseType?:string;}
export interface HrApproval {id:string;requestNo:string;requestType:string;applicantEmployeeId:string;subjectEmployeeId:string;title:string;payload:Record<string,unknown>;status:string;submittedAt:string|null;completedAt:string|null;}
export interface HrContract {id:string;employeeId?:string;employeeCode?:string;employeeName?:string;contractNo:string;contractTypeId?:string;contractTypeName:string;startDate:string|null;endDate:string|null;probationEndDate?:string|null;status:string;isHistoricalImport:boolean;}
export interface HrContractChange {id:string;sequenceNo:number;changeType:string;previousStartDate:string|null;previousEndDate:string|null;newStartDate:string;newEndDate:string|null;status:string;isHistoricalImport:boolean;}
export interface HrContractDetail extends HrContract {changes:HrContractChange[];}
export interface HrContractType {id:string;typeCode:string;typeName:string;isHistoricalImport:boolean;}
export interface HrAttendanceDay {date:string;legacySymbol:string|null;symbolStatus:string;normalizedKind:string|null;}
export interface HrAttendanceCalendar {id:string;calendarName:string|null;year:number;month:number;dayCount:number;days:HrAttendanceDay[];}
export interface HrAttendanceRequest {id:string;requestNo:string;requestType:string;startAt:string|null;endAt:string|null;attendanceDate:string|null;durationMinutes:number;reason:string;status:string;submittedAt:string|null;reviewedAt:string|null;reviewComment:string|null;isSelf:boolean;employeeId?:string;employeeCode?:string;employeeName?:string;}
export interface HrAttendanceShift {id:string;shiftCode:string;shiftName:string;startLocal:string;endLocal:string;crossesMidnight:boolean;lateGraceMinutes:number;earlyGraceMinutes:number;ruleVersion:string;status:string;}
export interface HrAttendanceDailyResult {id:string;workDate:string;firstInAt:string|null;lastOutAt:string|null;workedMinutes:number;lateMinutes:number;earlyMinutes:number;resultStatus:string;anomalyCodes:string[];corrected:boolean;calculationVersionId:string;isSelf:boolean;employeeId?:string;employeeCode?:string;employeeName?:string;}
export interface HrAttendancePeriod {id:string;periodMonth:string;status:string;activeVersion:number;calculationStartedAt:string|null;calculationCompletedAt:string|null;failureCode:string|null;closedAt:string|null;}
export interface HrAttendanceMonthSummary {id:string;summaryVersion:number;scheduledDays:number;normalDays:number;workedMinutes:number;lateMinutes:number;earlyMinutes:number;absenceDays:number;missingPunchDays:number;employeeId?:string;employeeCode?:string;employeeName?:string;}
export interface HrAttendancePayrollInput {periodId:string;periodMonth:string;batchId:string;batchNo:number;batchType:string;summaryVersion:number;items:Array<{id:string;employeeId:string;employeeCode:string;employeeName:string;workedMinutes:number;lateMinutes:number;earlyMinutes:number;absenceDays:number;missingPunchDays:number}>;}
export interface HrAttendancePayrollVersion {id:string;batchNo:number;batchType:string;status:string;summaryVersion:number;employeeCount:number;changedEmployeeCount:number;createdAt:string;}
export interface HrInsuranceItem {insuranceKind:string;contributionBase:string|null;employeeAmount:string|null;supplementAmount:string|null;legacyBaseNegative:boolean;employerAmount?:string|null;totalAmount?:string|null;}
export interface HrInsurancePeriod {id:string;employeeId?:string;employeeCode?:string;employeeName?:string;periodYear:number;periodMonth:number;needsReview:boolean;employeeAmount:string;supplementAmount:string;itemCount:number;employerAmount?:string;totalAmount?:string;items?:HrInsuranceItem[];}
export interface HrEmployeeListFilters {keyword?:string;status?:string;}
export interface HrContractListFilters {keyword?:string;status?:string;expiryFrom?:string;expiryTo?:string;}
export interface HrAttendanceFilters {year?:number;month?:number;}
export interface HrAttendanceRequestFilters {type?:string;status?:string;}
export interface HrInsuranceFilters {keyword?:string;year?:number;month?:number;needsReview?:boolean;}
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
 ,attendanceCalendars:(token?:string,page=1,pageSize=20,filters:HrAttendanceFilters={})=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.year)query.set("year",String(filters.year));if(filters.month)query.set("month",String(filters.month));return unwrap(apiRequest<PaginatedResult<HrAttendanceCalendar>>(`/hr/attendance/calendars?${query.toString()}`,{token}));}
 ,attendanceRequests:(token?:string,page=1,pageSize=30,filters:HrAttendanceRequestFilters={})=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.type)query.set("type",filters.type);if(filters.status)query.set("status",filters.status);return unwrap(apiRequest<PaginatedResult<HrAttendanceRequest>>(`/hr/attendance/requests?${query.toString()}`,{token}));}
 ,createAttendanceRequest:(body:object,token?:string)=>unwrap(apiRequest<HrAttendanceRequest>("/hr/attendance/requests",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,submitAttendanceRequest:(id:string,token?:string)=>unwrap(apiRequest<HrAttendanceRequest>(`/hr/attendance/requests/${id}/submit`,{method:"POST",token,idempotencyKey:crypto.randomUUID()}))
 ,cancelAttendanceRequest:(id:string,token?:string)=>unwrap(apiRequest<HrAttendanceRequest>(`/hr/attendance/requests/${id}/cancel`,{method:"POST",token,idempotencyKey:crypto.randomUUID()}))
 ,reviewAttendanceRequest:(id:string,decision:"approve"|"reject",comment:string|undefined,token?:string)=>unwrap(apiRequest<HrAttendanceRequest>(`/hr/attendance/requests/${id}/${decision}`,{method:"POST",body:comment?{comment}:{},token,idempotencyKey:crypto.randomUUID()}))
 ,attendanceShifts:(token?:string)=>unwrap(apiRequest<HrAttendanceShift[]>("/hr/attendance/shifts",{token}))
 ,createAttendanceShift:(body:object,token?:string)=>unwrap(apiRequest<{id:string}>("/hr/attendance/shifts",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,createAttendanceSchedule:(body:object,token?:string)=>unwrap(apiRequest<{id:string}>("/hr/attendance/schedules",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,createAttendancePunch:(body:object,token?:string)=>unwrap(apiRequest<{id:string}>("/hr/attendance/punch-events",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,attendanceDaily:(token?:string,page=1,pageSize=31,filters:{from?:string;to?:string;status?:string}={})=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.from)query.set("from",filters.from);if(filters.to)query.set("to",filters.to);if(filters.status)query.set("status",filters.status);return unwrap(apiRequest<PaginatedResult<HrAttendanceDailyResult>>(`/hr/attendance/daily-results?${query.toString()}`,{token}));}
 ,recalculateAttendance:(body:object,token?:string)=>unwrap(apiRequest<HrAttendanceDailyResult>("/hr/attendance/daily-results/recalculate",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,attendancePeriods:(token?:string,page=1,pageSize=24,status?:string)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(status)query.set("status",status);return unwrap(apiRequest<PaginatedResult<HrAttendancePeriod>>(`/hr/attendance/periods?${query.toString()}`,{token}));}
 ,createAttendancePeriod:(periodMonth:string,token?:string)=>unwrap(apiRequest<HrAttendancePeriod>("/hr/attendance/periods",{method:"POST",body:{periodMonth},token,idempotencyKey:crypto.randomUUID()}))
 ,calculateAttendancePeriod:(id:string,token?:string)=>unwrap(apiRequest<HrAttendancePeriod>(`/hr/attendance/periods/${id}/calculate`,{method:"POST",token,idempotencyKey:crypto.randomUUID()}))
 ,closeAttendancePeriod:(id:string,token?:string)=>unwrap(apiRequest<HrAttendancePeriod>(`/hr/attendance/periods/${id}/close`,{method:"POST",token,idempotencyKey:crypto.randomUUID()}))
 ,correctAttendancePeriod:(id:string,reason:string,token?:string)=>unwrap(apiRequest<{id:string;batchNo:number}>(`/hr/attendance/periods/${id}/corrections`,{method:"POST",body:{reason},token,idempotencyKey:crypto.randomUUID()}))
 ,attendanceMonthSummaries:(id:string,token?:string)=>unwrap(apiRequest<PaginatedResult<HrAttendanceMonthSummary>>(`/hr/attendance/periods/${id}/summaries?page=1&page_size=100`,{token}))
 ,payrollAttendanceInputs:(id:string,token?:string)=>unwrap(apiRequest<HrAttendancePayrollInput>(`/hr/attendance/periods/${id}/payroll-inputs`,{token}))
 ,attendancePayrollVersions:(id:string,token?:string)=>unwrap(apiRequest<HrAttendancePayrollVersion[]>(`/hr/attendance/periods/${id}/payroll-input-versions`,{token}))
 ,insurancePeriods:(token?:string,page=1,pageSize=20,filters:HrInsuranceFilters={},selfOnly=false)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.keyword)query.set("keyword",filters.keyword);if(filters.year)query.set("year",String(filters.year));if(filters.month)query.set("month",String(filters.month));if(filters.needsReview!==undefined)query.set("needs_review",String(filters.needsReview));return unwrap(apiRequest<PaginatedResult<HrInsurancePeriod>>(`/hr/insurance/periods${selfOnly?"/me":""}?${query.toString()}`,{token}));}
 ,insurancePeriod:(id:string,token?:string)=>unwrap(apiRequest<HrInsurancePeriod>(`/hr/insurance/periods/${id}`,{token}))
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
 ,payrollHistory:(token?:string,page=1,pageSize=20,filters:HrPayrollHistoryFilters={},signal?:AbortSignal)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.periodFrom)query.set("period_from",`${filters.periodFrom}-01`);if(filters.periodTo)query.set("period_to",`${filters.periodTo}-01`);if(filters.bookId)query.set("book_id",filters.bookId);if(filters.employeeId)query.set("employee_id",filters.employeeId);return unwrap(apiRequest<PaginatedResult<HrPayrollHistoryRow>>(`/hr/payroll/history?${query.toString()}`,{token,signal}));}
 ,payrollHistoryDetail:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrPayrollHistoryRow>(`/hr/payroll/history/${id}`,{token,signal}))
 ,payrollHistoryItems:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrPayrollHistoryItem[]>(`/hr/payroll/history/${id}/items`,{token,signal}))
 ,payrollHistoryTeamSummary:(token?:string,page=1,pageSize=20,signal?:AbortSignal)=>unwrap(apiRequest<PaginatedResult<Record<string,never>>>(`/hr/payroll/history/team-summary?page=${page}&page_size=${pageSize}`,{token,signal}))
 ,payrollHistoryBooks:(token?:string,page=1,pageSize=50,signal?:AbortSignal)=>unwrap(apiRequest<PaginatedResult<HrPayrollBook>>(`/hr/payroll/history-books?page=${page}&page_size=${pageSize}`,{token,signal}))
 ,payrollHistoryCatalogItems:(token?:string,page=1,pageSize=50,filters:HrPayrollCatalogFilters={},signal?:AbortSignal)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.bookId)query.set("book_id",filters.bookId);return unwrap(apiRequest<PaginatedResult<HrPayrollCatalogItem>>(`/hr/payroll/history-items?${query.toString()}`,{token,signal}));}
 ,payrollHistoryFormulas:(token?:string,page=1,pageSize=50,filters:HrPayrollCatalogFilters={},signal?:AbortSignal)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.bookId)query.set("book_id",filters.bookId);if(filters.parseStatus)query.set("parse_status",filters.parseStatus);return unwrap(apiRequest<PaginatedResult<HrPayrollFormula>>(`/hr/payroll/history-formulas?${query.toString()}`,{token,signal}));}
 ,payrollHistoryReviewCases:(token?:string,page=1,pageSize=20,filters:HrPayrollCatalogFilters={},signal?:AbortSignal)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.status)query.set("status",filters.status);if(filters.caseType)query.set("case_type",filters.caseType);return unwrap(apiRequest<PaginatedResult<HrPayrollReviewCase>>(`/hr/payroll/history-review-cases?${query.toString()}`,{token,signal}));}
 ,payrollHistoryReviewCase:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrPayrollReviewCase>(`/hr/payroll/history-review-cases/${id}`,{token,signal}))
 ,addPayrollHistoryReviewAction:(id:string,body:{action:string;decision:string;comment:string},token?:string)=>unwrap(apiRequest<HrPayrollReviewAction>(`/hr/payroll/history-review-cases/${id}/actions`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,myApprovals:(token?:string)=>unwrap(apiRequest<HrApproval[]>("/hr/approvals/me",{token}))
 ,pendingApprovals:(token?:string)=>unwrap(apiRequest<HrApproval[]>("/hr/approvals/pending",{token}))
 ,createApproval:(body:object,token?:string)=>unwrap(apiRequest<HrApproval>("/hr/approvals",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,approvalAction:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrApproval>(`/hr/approvals/${id}/actions`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,reviewApproval:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrApproval>(`/hr/approvals/${id}/review`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
};
