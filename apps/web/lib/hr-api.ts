import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest, createIdempotencyKey } from "./api-client";
export interface HrEmployee {id:string;employeeCode:string;fullName:string;userId:string|null;primaryOrgId:string|null;positionId:string|null;managerEmployeeId:string|null;employmentType:string;employmentStatus:string;hireDate:string|null;departureDate:string|null;workLocation:string|null;workMobile:string|null;workEmail:string|null;}
export interface HrLegacyArchiveFile {id:string;logicalKind:"photo"|"document"|"attachment"|string;logicalName:string;mediaType:string|null;sizeBytes:string|null;availability:string;contentFingerprint?:string;}
export interface HrLegacyArchiveRecord {id:string;employeeId:string|null;mappingStatus:"mapped"|"archive_only"|"quarantine"|"resolved";recordType:string;occurredOn:string|null;displayTitle:string;projection:Record<string,unknown>;hasSensitiveSource:boolean;sourceSystem?:string;sourceTable?:string;resolutionReasonCode?:string|null;files?:HrLegacyArchiveFile[];}
export interface HrLegacyArchiveFilters {status?:string;recordType?:string;employeeId?:string;keyword?:string;}
export interface HrPosition {id:string;orgId:string;positionCode:string;positionName:string;jobFamily:string|null;jobLevel:string|null;headcountLimit:number|null;status:string;}
export interface HrEmploymentEvent {id:string;eventNo:string|null;eventType:string;effectiveDate:string;reason:string|null;createTime:string;}
export interface HrEmploymentEventStatistics {from:string;to:string;total:number;employeeCount:number;historicalCount:number;onlineCount:number;byType:Array<{eventType:string;count:number}>;byMonth:Array<{month:string;count:number}>;}
export interface HrWorkforceDecisionSnapshot {from:string;to:string;employeeTotal:number;activeHeadcount:number;byStatus:Array<{status:string;count:number}>;byType:Array<{type:string;count:number}>;staffing:{positionTotal:number;configuredPositionCount:number;unconfiguredPositionCount:number;headcountLimit:number;activeAssignedHeadcount:number;activeUnassignedHeadcount:number;vacancyCount:number;overCapacityPositionCount:number;};employmentEvents:HrEmploymentEventStatistics;}
export interface HrEmployeeProfile {id:string;employeeId:string;idType:string|null;idNumber?:string|null;idNumberMasked:string|null;englishName?:string|null;gender?:string|null;dateOfBirth?:string|null;ethnicity?:string|null;nativePlace?:string|null;politicalStatus?:string|null;partyJoinDate?:string|null;heightCm?:string|null;weightKg?:string|null;maritalStatus?:string|null;healthStatus?:string|null;householdRegistration?:string|null;highestEducation?:string|null;major?:string|null;degree?:string|null;foreignLanguage?:string|null;languageLevel?:string|null;graduationDate?:string|null;graduationSchool?:string|null;homePhone?:string|null;jobTitle:string|null;jobGrade:string|null;employeeCategory:string|null;technicalTitle:string|null;technicalGrade:string|null;personalMobile:string|null;personalEmail:string|null;address:string|null;emergencyContactName:string|null;emergencyContactMobile:string|null;remark?:string|null;masked:boolean;}
export interface HrGoalCycle {id:string;cycleCode:string;cycleName:string;startDate:string;endDate:string;status:string;}
export interface HrGoal {id:string;cycleId:string;parentGoalId:string|null;goalLevel:string;goalName:string;ownerOrgId:string|null;ownerEmployeeId:string|null;ownerName:string|null;weight:string;metricType:string;metricName:string|null;targetValue:string|null;currentValue:string|null;unit:string|null;progress:string;startDate:string;dueDate:string;status:string;currentVersionNo:number;}
export interface HrGoalOptions {canCreateGroup:boolean;orgs:Array<{id:string;orgName:string}>;employees:Array<{id:string;fullName:string}>;}
export interface HrGoalCheckin {id:string;goalId:string;progress:string;currentValue:string|null;summary:string;risks:string|null;confidence:string;nextAction:string|null;createTime:string;}
export interface HrWorkReport {id:string;employeeName:string|null;reportType:string;periodStart:string;periodEnd:string;title:string|null;completedWork:string;nextPlan:string|null;risks:string|null;questionsAndSuggestions:string|null;collaborationNeeds:string|null;hours:string|null;status:string;submissionNo:number;reviewComment:string|null;submittedAt:string|null;reviewedAt:string|null;goalSuggestions:Array<{goalId:string;goalName?:string;proposedProgress:string|null;proposedCurrentValue:string|null;suggestionSummary:string|null}>;}
export interface HrWorkReportAction {id:string;actionType:string;fromStatus:string|null;toStatus:string;submissionNo:number;comment:string|null;createTime:string;}
export interface HrPerformanceCycle {id:string;cycleCode:string;cycleName:string;startDate:string;endDate:string;status:string;}
export interface HrPerformancePlan {id:string;cycleId:string;employeeId:string;managerEmployeeId:string|null;status:string;selfScore:string|null;managerScore:string|null;calibratedScore:string|null;finalScore:string|null;selfSummary:string|null;managerComment:string|null;calibrationComment:string|null;}
export interface HrPerformanceTemplateV2 {id:string;templateCode:string;templateName:string;status:string;currentVersionNo:number;versionId:string|null;versionName:string|null;versionStatus:string|null;dimensions:Array<{code:string;name:string;weight:string;scoreMin:string;scoreMax:string}>;levels:Array<{code:string;name:string;scoreMin:string;scoreMax:string}>;}
export interface HrPerformanceCycleV2 {id:string;cycleCode:string;cycleName:string;startDate:string;endDate:string;status:string;templateName:string;employeeCount:number;}
export interface HrPerformanceReviewV2 {id:string;cycleId:string;cycleName:string;status:string;employee:{id:string;code:string|null;name:string|null};dimensions:Array<{code:string;name:string;weight:string;scoreMin:string;scoreMax:string}>;selfSubmission:{scores:Record<string,number>;comments:Record<string,string>;score:string}|null;managerSubmission:{scores:Record<string,number>;comments:Record<string,string>;score:string}|null;calibration:{scores:Record<string,number>;score:string}|null;result:{score:string;levelCode:string;levelName:string}|null;appeal:{id:string;status:string}|null;actions:{selfReview:boolean;managerReview:boolean;acknowledge:boolean;appeal:boolean;resolveAppeal:boolean};}
export interface HrFeedbackAssignment {id:string;feedbackCycleId:string;subjectEmployeeId:string;reviewerEmployeeId:string;relationType:string;weight:string;status:string;}
export interface HrFeedback360Task {id:string;cycleName:string;subjectName:string;relationType:string;status:string;responseEnd:string;questionnaire:{questions:Array<{code:string;text:string;type:"rating"|"text";required:boolean;dimensionCode:string}>};}
export interface HrFeedback360Cycle {id:string;cycleCode:string;cycleName:string;nominationEnd:string;responseEnd:string;minimumAnonymousResponses:number;status:string;subjectCount:number;}
export interface HrFeedback360Result {cycleName:string;subjectName:string;publishedAt:string;dimensions:Array<{dimensionCode:string;averageScore:string}>;}
export interface HrFeedback360Options {employees:Array<{id:string;fullName:string;employeeCode:string;orgId:string|null}>;models:Array<{id:string;modelName:string;versionName:string}>;questionnaires:Array<{id:string;questionnaireName:string;versionName:string;modelVersionId:string}>;subjects:Array<{id:string;cycleName:string;subjectName:string;status:string}>;}
export interface HrFeedback360Nomination {id:string;subjectId:string;cycleName:string;subjectName:string;nomineeName:string;relationType:string;status:string;canDecide:boolean;}
export interface HrTalentOptions {employees:Array<{id:string;employeeCode:string;fullName:string;orgId:string|null}>;positions:Array<{id:string;positionCode:string;positionName:string}>;}
export interface HrTalentProfile {id:string;snapshotNo:number;asOfDate:string;employeeName:string;employeeCode:string;performanceSource:Record<string,unknown>;feedbackSource:Record<string,unknown>;createdAt:string;}
export interface HrTalentSession {id:string;sessionCode:string;sessionName:string;reviewDate:string;status:string;subjectCount:number;}
export interface HrTalentSubject {id:string;employeeName:string;employeeCode:string;profileAsOf:string;performanceBand:string|null;potentialBand:string|null;nineBox:string|null;potentialScore:string|null;reason:string|null;}
export interface HrSuccessionRow {criticalPositionId:string;positionName:string;criticality:string;positionRisk:string;candidateName:string|null;employeeCode:string|null;readiness:string|null;candidateRisk:string|null;riskReason:string|null;assessedAt:string|null;}
export interface HrDevelopmentPlan {id:string;planCode:string;planName:string;developmentGoal:string;startDate:string;endDate:string;status:string;employeeName:string;actions:Array<{id:string;actionName:string;ownerName:string;dueDate:string;status:string;evidence:unknown[];canAct:boolean}>;}
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
export interface HrPayrollReconciliationDifference {
  id: string;
  resultId: string;
  itemName: string;
  oldAmount: string;
  newAmount: string;
  deltaAmount: string;
  toleranceAmount: string;
  reviewStatus: string;
}
export interface HrPayrollReconciliationResult {
  resultId: string;
  employeeCode: string;
  employeeName: string;
  oldTotal: string;
  newTotal: string;
  deltaTotal: string;
  reviewStatus: string;
  differences: HrPayrollReconciliationDifference[];
}
export interface HrPayrollReconciliation {
  id: string;
  status: string;
  toleranceAmount: string;
  employeeCount: number;
  differenceCount: number;
  engineVersion: string;
  createdAt: string;
  legacyBatchCode?: string;
  attendanceBatchNo?: number;
  results?: HrPayrollReconciliationResult[];
  resultPage?: number;
  resultPageSize?: number;
  resultTotal?: number;
}
export interface HrPayrollReconciliationSetup {
  books: Array<{
    id: string;
    bookName: string;
    legacyScheme: string;
    policyVersionId: string | null;
    netItemVersionId: string | null;
    netItemName: string | null;
    toleranceAmount: string | null;
    policyVersion: number | null;
  }>;
  netItems: Array<{
    bookId: string;
    id: string;
    displayName: string;
    itemCode: string;
    versionNo: number;
  }>;
  legacyBatches: Array<{
    id: string;
    batchCode: string;
    sourceRowCount: number;
    publishedAt: string;
  }>;
  attendanceBatches: Array<{
    id: string;
    batchNo: number;
    periodMonth: string;
    batchType: string;
  }>;
}
export interface HrPayrollHistoryFilters {periodFrom?:string;periodTo?:string;bookId?:string;employeeId?:string;}
export interface HrPayrollCatalogFilters {bookId?:string;parseStatus?:string;status?:string;caseType?:string;}
export interface HrApproval {id:string;requestNo:string;requestType:string;applicantEmployeeId:string;subjectEmployeeId:string;title:string;payload:Record<string,unknown>;status:string;submittedAt:string|null;completedAt:string|null;}
export interface HrContract {id:string;employeeId?:string;employeeCode?:string;employeeName?:string;contractNo:string;contractTypeId?:string;contractTypeName:string;startDate:string|null;endDate:string|null;probationEndDate?:string|null;contractTermMonths?:number|null;signatureDate?:string|null;effectiveDate?:string|null;positionTitle?:string|null;workType?:string|null;departmentNameSnapshot?:string|null;probationMonths?:number|null;probationSalary?:string|null;baseSalary?:string|null;remark?:string|null;status:string;isHistoricalImport:boolean;}
export interface HrContractChange {id:string;sequenceNo:number;changeType:string;previousStartDate:string|null;previousEndDate:string|null;newStartDate:string;newEndDate:string|null;status:string;isHistoricalImport:boolean;}
export interface HrContractAction {id:string;sequenceNo:number;action:string;fromStatus:string|null;toStatus:string;occurredAt:string;}
export interface HrContractDetail extends HrContract {changes:HrContractChange[];actions:HrContractAction[];}
export interface HrContractType {id:string;typeCode:string;typeName:string;isHistoricalImport:boolean;}
export type HrContractReminderStatus="open"|"read"|"acknowledged"|"resolved"|"cancelled";
export type HrContractReminderAction="read"|"acknowledge"|"resolve"|"cancel";
export interface HrContractReminder {id:string;contractId:string;employeeId:string;kind:"contract_expiry"|"probation_expiry"|string;windowDays:number;dueDate:string;status:HrContractReminderStatus;}
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
export interface HrInsurancePeriod {id:string;employeeId?:string;employeeCode?:string;employeeName?:string;periodYear:number;periodMonth:number;needsReview:boolean;employeeAmount?:string;supplementAmount?:string;itemCount:number;employerAmount?:string;totalAmount?:string;items?:HrInsuranceItem[];}
export interface HrEmployeeListFilters {keyword?:string;status?:string;}
export interface HrRequisition {id:string;requisitionCode:string;title:string;orgId:string;orgName:string;positionId:string|null;positionName:string|null;headcount:number;hiredCount:number;ownerUserId:string;ownerName:string|null;plannedOnboardDate:string|null;status:string;}
export interface HrCandidate {id:string;candidateNo:string;fullName:string;requisitionId:string;requisitionTitle:string;stage:string;source:string|null;expectedOnboardDate:string|null;latestEvaluation:string|null;mobileMasked:string|null;emailMasked:string|null;identityMasked:string|null;convertedEmployeeId:string|null;}
export interface HrCandidateSensitiveDetail {id:string;candidateNo:string;fullName:string;requisitionId:string;requisitionTitle:string;stage:string;source:string|null;expectedOnboardDate:string|null;latestEvaluation:string|null;mobile:string|null;email:string|null;identityNumber:string|null;convertedEmployeeId:string|null;}
export interface HrOnboardingApplication {id:string;applicationNo:string;applicationName:string;employeeId:string;employeeCode?:string;employeeName?:string;candidateId:string|null;applicationDate:string;plannedHireDate:string;probationMonths:number;attendanceCardNo:string;status:string;reviewComment:string|null;reviewedAt:string|null;confirmedAt:string|null;remark:string|null;}
export interface HrProbationParticipant {id:string;employeeId:string;employeeCode:string;employeeName:string;plannedConfirmationDate:string;confirmedDate:string|null;status:string;}
export interface HrProbationApplication {id:string;applicationNo:string;applicationName:string;applicationDate:string;reason:string;status:string;reviewComment:string|null;reviewedAt:string|null;confirmedAt:string|null;participants:HrProbationParticipant[];}
export interface HrJobChangeApplication {id:string;applicationNo:string;applicationName:string;employeeId:string;employeeCode:string;employeeName:string;applicationDate:string;effectiveDate:string;changeType:string;beforeOrgId:string;beforeOrgName:string|null;beforePositionId:string|null;beforePositionName:string|null;afterOrgId:string;afterOrgName:string|null;afterPositionId:string|null;afterPositionName:string|null;reason:string;status:string;reviewComment:string|null;reviewedAt:string|null;appliedAt:string|null;}
export interface HrJobChangeOptions {employees:Array<{id:string;employeeCode:string;employeeName:string;orgId:string;orgName:string|null;positionId:string|null;positionName:string|null}>;orgs:Array<{id:string;orgName:string}>;positions:Array<{id:string;orgId:string;positionCode:string;positionName:string}>;}
export interface HrDepartureApplication {id:string;applicationNo:string;applicationName:string;employeeId:string;employeeCode:string;employeeName:string;orgName:string|null;applicationDate:string;plannedDepartureDate:string;departureType:string;reason?:string;status:string;reviewComment?:string|null;interviewStatus:string;surveyStatus:string;handoverStatus:string;wageStatus:string;archiveStatus:string;interviewPlace?:string|null;interviewSummary?:string|null;surveyReasonCodes?:string[];surveySummary?:string|null;handoverToEmployeeId?:string|null;handoverSummary?:string|null;wageNote?:string|null;archiveNote?:string|null;appliedAt:string|null;}
export interface HrDepartureOptions {employees:Array<{id:string;employeeCode:string;employeeName:string;orgId:string|null;orgName:string|null;employmentStatus:string}>;}
export interface HrLifecycleChecklist {id:string;employeeId:string;employeeName:string;type:string;status:string;dueDate:string|null;itemCount:number;doneCount:number;overdueCount:number;}
export interface HrLifecycleTemplate {id:string;code:string;name:string;type:string;versionId:string;versionNo:number;itemCount:number;}
export interface HrLifecycleItem {id:string;itemCode:string;itemName:string;category:string;sequenceNo:number;status:string;responsibleUserId:string|null;dueDate:string|null;required:boolean;completedAt:string|null;overdue:boolean;}
export interface HrLifecycleChecklistDetail {id:string;employeeId:string;employeeName:string;type:string;status:string;dueDate:string|null;items:HrLifecycleItem[];}
export interface HrTrainingCourse {id:string;code:string;versionNo:number;title:string;category:string;provider:string|null;hours:string;status:string;}
export interface HrTrainingPlan {id:string;code:string;name:string;status:string;mandatory:boolean;startDate:string;endDate:string;courseTitle:string|null;participantCount:number;completedCount:number;budgetAmount?:string;actualCost?:string;costCurrency?:string;}
export interface HrTrainingParticipant {id?:string;employeeName:string;status:string;checkedInAt:string|null;completedHours:string|null;score?:string|null;evaluation?:string|null;actualCost?:string;certificateFileId?:string|null;correctionVersion:number;canAct:boolean;}
export interface HrTrainingPlanDetail extends Omit<HrTrainingPlan,"participantCount"|"completedCount"|"courseTitle"> {snapshot:Record<string,unknown>;participants:HrTrainingParticipant[];}
export interface HrTrainingPositionRequirement {id:string;status:string;positionId:string;positionCode:string;positionName:string;courseId:string;courseCode:string;courseTitle:string;hours:string;createdAt:string;disabledAt:string|null;}
export interface HrTrainingPositionRequirementGap {requirementId:string;positionName:string;courseCode:string;courseTitle:string;employeeId:string;employeeCode:string;employeeName:string;completed:boolean;}
export interface HrRewardCategory{id:string;code:string;versionNo:number;kind:"reward"|"discipline";name:string;impactLevel:string;status:string;}
export interface HrRewardCase{id:string;code:string;status:string;occurredOn:string;employeeName:string;kind:string;categoryName:string|null;impactLevel:string;summary:string;amountSuggestion?:string|null;currency?:string|null;}
export interface HrRewardCaseDetail extends HrRewardCase{detailedReason?:string|null;evidenceFileIds?:string[];corrections?:Array<{sequenceNo:number;type:string;summary:string;createdAt:string}>;}
export interface HrEmployeeRecords {employeeId:string;experiences:Array<{id:string;type:string;organizationName:string;title:string|null;startDate:string;endDate:string|null;summary:string|null}>;skills:Array<{id:string;skillName:string;proficiency:string|null;acquiredDate:string|null}>;family:Array<{id:string;relationship:string;fullNameMasked:string;identityMasked:string|null;contactMasked:string|null;isEmergencyContact:boolean}>;credentials:Array<{id:string;credentialType:string;credentialName:string;numberMasked:string|null;issuingAuthority:string|null;acquiredDate:string|null;validTo:string|null}>;fieldAccess:{family:boolean;credential:boolean};}
export interface HrContractListFilters {keyword?:string;status?:string;expiryFrom?:string;expiryTo?:string;}
export interface HrAttendanceFilters {year?:number;month?:number;}
export interface HrAttendanceRequestFilters {type?:string;status?:string;}
export interface HrInsuranceFilters {keyword?:string;year?:number;month?:number;needsReview?:boolean;}
export interface HrDirectoryOrgOption {id:string;orgCode:string;orgName:string;status:string;}
export interface HrDirectoryUserOption {id:string;username:string;displayName:string;realName?:string;status:string;}
export interface HrDirectoryOptions {orgs:HrDirectoryOrgOption[];users:HrDirectoryUserOption[];}
async function unwrap<T>(p:Promise<{data:T}>){return (await p).data;}
export const hrApi={
 directoryOptions:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrDirectoryOptions>("/hr/directory-options",{token,signal})),
 recruitmentRequisitions:(token?:string,page=1,pageSize=50,filters:{keyword?:string;status?:string}={},signal?:AbortSignal)=>{const q=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.keyword)q.set("keyword",filters.keyword);if(filters.status)q.set("status",filters.status);return unwrap(apiRequest<PaginatedResult<HrRequisition>>(`/hr/recruitment/requisitions?${q}`,{token,signal}));},
 createRecruitmentRequisition:(body:object,token?:string,idempotencyKey=createIdempotencyKey("hr-requisition-create"))=>unwrap(apiRequest<HrRequisition>("/hr/recruitment/requisitions",{method:"POST",body,token,idempotencyKey})),
 recruitmentCandidates:(token?:string,page=1,pageSize=50,filters:{keyword?:string;stage?:string}={},signal?:AbortSignal)=>{const q=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.keyword)q.set("keyword",filters.keyword);if(filters.stage)q.set("stage",filters.stage);return unwrap(apiRequest<PaginatedResult<HrCandidate>>(`/hr/recruitment/candidates?${q}`,{token,signal}));},
 recruitmentCandidateDetail:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrCandidateSensitiveDetail>(`/hr/recruitment/candidates/${id}`,{token,signal})),
 createRecruitmentCandidate:(body:object,token?:string,idempotencyKey=createIdempotencyKey("hr-candidate-create"))=>unwrap(apiRequest<HrCandidate>("/hr/recruitment/candidates",{method:"POST",body,token,idempotencyKey})),
 moveRecruitmentCandidate:(id:string,body:object,token?:string,idempotencyKey=createIdempotencyKey("hr-candidate-stage"))=>unwrap(apiRequest<{id:string;fromStage:string;toStage:string}>(`/hr/recruitment/candidates/${id}/stage-actions`,{method:"POST",body,token,idempotencyKey})),
 convertRecruitmentCandidate:(id:string,body:object,token?:string,idempotencyKey=createIdempotencyKey("hr-candidate-convert"))=>unwrap(apiRequest<{candidateId:string;employeeId:string;employeeStatus:string;checklistId:string;loginCreated:boolean}>(`/hr/recruitment/candidates/${id}/convert`,{method:"POST",body,token,idempotencyKey})),
 onboardingApplications:(token?:string,page=1,pageSize=20,status?:string,signal?:AbortSignal)=>{const q=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(status)q.set("status",status);return unwrap(apiRequest<PaginatedResult<HrOnboardingApplication>>(`/hr/onboarding-applications?${q}`,{token,signal}));},
 createOnboardingApplication:(body:object,token?:string)=>unwrap(apiRequest<HrOnboardingApplication>("/hr/onboarding-applications",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-onboarding-create")})),
 updateOnboardingApplication:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrOnboardingApplication>(`/hr/onboarding-applications/${id}`,{method:"PUT",body,token,idempotencyKey:createIdempotencyKey("hr-onboarding-update")})),
 onboardingApplicationAction:(id:string,action:"submit"|"resubmit"|"cancel",token?:string)=>unwrap(apiRequest<HrOnboardingApplication>(`/hr/onboarding-applications/${id}/actions`,{method:"POST",body:{action},token,idempotencyKey:createIdempotencyKey(`hr-onboarding-${action}`)})),
 reviewOnboardingApplication:(id:string,action:"approve"|"return",comment:string,token?:string)=>unwrap(apiRequest<HrOnboardingApplication>(`/hr/onboarding-applications/${id}/review`,{method:"POST",body:{action,comment},token,idempotencyKey:createIdempotencyKey(`hr-onboarding-${action}`)})),
 confirmOnboardingApplication:(id:string,token?:string)=>unwrap(apiRequest<HrOnboardingApplication>(`/hr/onboarding-applications/${id}/confirm`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-onboarding-confirm")})),
 probationApplications:(token?:string,page=1,pageSize=20,status?:string,signal?:AbortSignal)=>{const q=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(status)q.set("status",status);return unwrap(apiRequest<PaginatedResult<HrProbationApplication>>(`/hr/probation-applications?${q}`,{token,signal}));},
 createProbationApplication:(body:object,token?:string)=>unwrap(apiRequest<HrProbationApplication>("/hr/probation-applications",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-probation-create")})),
 updateProbationApplication:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrProbationApplication>(`/hr/probation-applications/${id}`,{method:"PUT",body,token,idempotencyKey:createIdempotencyKey("hr-probation-update")})),
 probationApplicationAction:(id:string,action:"submit"|"resubmit"|"cancel",token?:string)=>unwrap(apiRequest<HrProbationApplication>(`/hr/probation-applications/${id}/actions`,{method:"POST",body:{action},token,idempotencyKey:createIdempotencyKey(`hr-probation-${action}`)})),
 reviewProbationApplication:(id:string,action:"approve"|"return",comment:string,token?:string)=>unwrap(apiRequest<HrProbationApplication>(`/hr/probation-applications/${id}/review`,{method:"POST",body:{action,comment},token,idempotencyKey:createIdempotencyKey(`hr-probation-${action}`)})),
 confirmProbationApplication:(id:string,token?:string)=>unwrap(apiRequest<HrProbationApplication>(`/hr/probation-applications/${id}/confirm`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-probation-confirm")})),
 jobChangeApplications:(token?:string,page=1,pageSize=20,status?:string,signal?:AbortSignal)=>{const q=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(status)q.set("status",status);return unwrap(apiRequest<PaginatedResult<HrJobChangeApplication>>(`/hr/job-change-applications?${q}`,{token,signal}));},
 jobChangeOptions:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrJobChangeOptions>("/hr/job-change-applications/options",{token,signal})),
 createJobChangeApplication:(body:object,token?:string)=>unwrap(apiRequest<HrJobChangeApplication>("/hr/job-change-applications",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-job-change-create")})),
 updateJobChangeApplication:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrJobChangeApplication>(`/hr/job-change-applications/${id}`,{method:"PUT",body,token,idempotencyKey:createIdempotencyKey("hr-job-change-update")})),
 jobChangeApplicationAction:(id:string,action:"submit"|"resubmit"|"cancel",token?:string)=>unwrap(apiRequest<HrJobChangeApplication>(`/hr/job-change-applications/${id}/actions`,{method:"POST",body:{action},token,idempotencyKey:createIdempotencyKey(`hr-job-change-${action}`)})),
 reviewJobChangeApplication:(id:string,action:"approve"|"return",comment:string,token?:string)=>unwrap(apiRequest<HrJobChangeApplication>(`/hr/job-change-applications/${id}/review`,{method:"POST",body:{action,comment},token,idempotencyKey:createIdempotencyKey(`hr-job-change-${action}`)})),
 applyJobChangeApplication:(id:string,token?:string)=>unwrap(apiRequest<HrJobChangeApplication>(`/hr/job-change-applications/${id}/apply`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-job-change-apply")})),
 departureApplications:(token?:string,page=1,pageSize=20,status?:string,signal?:AbortSignal)=>{const q=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(status)q.set("status",status);return unwrap(apiRequest<PaginatedResult<HrDepartureApplication>>(`/hr/departure-applications?${q}`,{token,signal}));},
 departureOptions:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrDepartureOptions>("/hr/departure-applications/options",{token,signal})),
 createDepartureApplication:(body:object,token?:string)=>unwrap(apiRequest<HrDepartureApplication>("/hr/departure-applications",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-departure-create")})),
 updateDepartureApplication:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrDepartureApplication>(`/hr/departure-applications/${id}`,{method:"PUT",body,token,idempotencyKey:createIdempotencyKey("hr-departure-update")})),
 departureApplicationAction:(id:string,action:"submit"|"resubmit"|"cancel",token?:string)=>unwrap(apiRequest<HrDepartureApplication>(`/hr/departure-applications/${id}/actions`,{method:"POST",body:{action},token,idempotencyKey:createIdempotencyKey(`hr-departure-${action}`)})),
 reviewDepartureApplication:(id:string,action:"approve"|"return",comment:string,token?:string)=>unwrap(apiRequest<HrDepartureApplication>(`/hr/departure-applications/${id}/review`,{method:"POST",body:{action,comment},token,idempotencyKey:createIdempotencyKey(`hr-departure-${action}`)})),
 recordDepartureInterview:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrDepartureApplication>(`/hr/departure-applications/${id}/interview`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-departure-interview")})),
 recordDepartureSurvey:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrDepartureApplication>(`/hr/departure-applications/${id}/survey`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-departure-survey")})),
 recordDepartureHandover:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrDepartureApplication>(`/hr/departure-applications/${id}/handover`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-departure-handover")})),
 recordDepartureWage:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrDepartureApplication>(`/hr/departure-applications/${id}/wage-settlement`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-departure-wage")})),
 closeDepartureArchive:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrDepartureApplication>(`/hr/departure-applications/${id}/archive`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-departure-archive")})),
 applyDepartureApplication:(id:string,token?:string)=>unwrap(apiRequest<HrDepartureApplication>(`/hr/departure-applications/${id}/apply`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-departure-apply")})),
 lifecycleChecklists:(token?:string,page=1,pageSize=20,signal?:AbortSignal)=>unwrap(apiRequest<PaginatedResult<HrLifecycleChecklist>>(`/hr/lifecycle/checklists?page=${page}&page_size=${pageSize}`,{token,signal})),
 lifecycleTemplates:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrLifecycleTemplate[]>("/hr/lifecycle/templates",{token,signal})),
 createLifecycleTemplate:(body:object,token?:string)=>unwrap(apiRequest<HrLifecycleTemplate>("/hr/lifecycle/templates",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-lifecycle-template")})),
 createLifecycleChecklist:(body:object,token?:string)=>unwrap(apiRequest<HrLifecycleChecklist>("/hr/lifecycle/checklists",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-lifecycle-checklist")})),
 lifecycleChecklist:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrLifecycleChecklistDetail>(`/hr/lifecycle/checklists/${id}`,{token,signal})),
 trainingCourses:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrTrainingCourse[]>("/hr/training/courses",{token,signal})),
 trainingPlanOptions:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<{courses:Array<Pick<HrTrainingCourse,"id"|"title"|"hours">>;employees:Array<Pick<HrEmployee,"id"|"employeeCode"|"fullName">>}>("/hr/training/plan-options",{token,signal})),
 trainingRequirementOptions:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<{courses:Array<Pick<HrTrainingCourse,"id"|"title">>;positions:Array<{id:string;positionCode:string;positionName:string}>}>("/hr/training/requirement-options",{token,signal})),
 trainingPositionRequirements:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrTrainingPositionRequirement[]>("/hr/training/position-requirements",{token,signal})),
 trainingPositionRequirementGaps:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrTrainingPositionRequirementGap[]>("/hr/training/position-requirement-gaps",{token,signal})),
 createTrainingPositionRequirement:(body:object,token?:string)=>unwrap(apiRequest<{id:string;status:string}>("/hr/training/position-requirements",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-training-position-requirement")})),
 disableTrainingPositionRequirement:(id:string,token?:string)=>unwrap(apiRequest<{id:string;status:string}>(`/hr/training/position-requirements/${id}/disable`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-training-position-requirement-disable")})),
 createTrainingCourse:(body:object,token?:string)=>unwrap(apiRequest<HrTrainingCourse>("/hr/training/courses",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-training-course")})),
 createTrainingCourseVersion:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrTrainingCourse>(`/hr/training/courses/${id}/versions`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-training-course-version")})),
 trainingPlans:(token?:string,page=1,pageSize=20,status?:string,signal?:AbortSignal)=>{const q=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(status)q.set("status",status);return unwrap(apiRequest<PaginatedResult<HrTrainingPlan>>(`/hr/training/plans?${q}`,{token,signal}));},
 trainingPlan:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrTrainingPlanDetail>(`/hr/training/plans/${id}`,{token,signal})),
 createTrainingPlan:(body:object,token?:string)=>unwrap(apiRequest<HrTrainingPlan>("/hr/training/plans",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-training-plan")})),
 trainingPlanAction:(id:string,action:"publish"|"start"|"complete"|"cancel",token?:string)=>unwrap(apiRequest(`/hr/training/plans/${id}/${action}`,{method:"POST",token,idempotencyKey:createIdempotencyKey(`hr-training-${action}`)})),
 trainingCheckIn:(id:string,token?:string)=>unwrap(apiRequest(`/hr/training/participants/${id}/check-in`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-training-check-in")})),
 completeTraining:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/training/participants/${id}/complete`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-training-complete")})),
 correctTraining:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/training/participants/${id}/corrections`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-training-correction")})),
 rewardCategories:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrRewardCategory[]>("/hr/rewards/categories",{token,signal})),
 rewardOptions:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<{categories:HrRewardCategory[];employees:Array<Pick<HrEmployee,"id"|"employeeCode"|"fullName">>}>('/hr/rewards/options',{token,signal})),
 rewardCases:(token?:string,page=1,pageSize=20,status?:string,signal?:AbortSignal)=>{const q=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(status)q.set("status",status);return unwrap(apiRequest<PaginatedResult<HrRewardCase>>(`/hr/rewards/cases?${q}`,{token,signal}));},
 rewardCase:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrRewardCaseDetail>(`/hr/rewards/cases/${id}`,{token,signal})),
 createRewardCategory:(body:object,token?:string)=>unwrap(apiRequest<HrRewardCategory>('/hr/rewards/categories',{method:'POST',body,token,idempotencyKey:createIdempotencyKey('hr-reward-category')})),
 createRewardCase:(body:object,token?:string)=>unwrap(apiRequest<HrRewardCase>('/hr/rewards/cases',{method:'POST',body,token,idempotencyKey:createIdempotencyKey('hr-reward-case')})),
 updateRewardCase:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrRewardCase>(`/hr/rewards/cases/${id}`,{method:'PUT',body,token,idempotencyKey:createIdempotencyKey('hr-reward-case-update')})),
 rewardCaseAction:(id:string,action:'submit'|'resubmit'|'withdraw'|'approve'|'return',body:object,token?:string)=>unwrap(apiRequest(`/hr/rewards/cases/${id}/${action}`,{method:'POST',body,token,idempotencyKey:createIdempotencyKey(`hr-reward-${action}`)})),
 lifecycleItemAction:(checklistId:string,itemId:string,body:object,token?:string)=>unwrap(apiRequest<{id:string;status:string;action:string}>(`/hr/lifecycle/checklists/${checklistId}/items/${itemId}/actions`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-lifecycle-action")})),
 employeeRecords:(employeeId:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrEmployeeRecords>(`/hr/employees/${employeeId}/records`,{token,signal})),
 legacyArchive:(token?:string,page=1,pageSize=20,filters:HrLegacyArchiveFilters={},unclaimed=false,signal?:AbortSignal)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.status)query.set("status",filters.status);if(filters.recordType)query.set("record_type",filters.recordType);if(filters.employeeId)query.set("employee_id",filters.employeeId);if(filters.keyword)query.set("keyword",filters.keyword);return unwrap(apiRequest<PaginatedResult<HrLegacyArchiveRecord>>(`/hr/legacy-archive${unclaimed?"/unclaimed":""}?${query.toString()}`,{token,signal}));},
 legacyArchiveDetail:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrLegacyArchiveRecord>(`/hr/legacy-archive/${id}`,{token,signal})),
 createEmployeeRecord:(employeeId:string,body:object,token?:string)=>unwrap(apiRequest<{id:string;recordType:string}>(`/hr/employees/${employeeId}/records`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-employee-record")})),
 employees:(token?:string,page=1,pageSize=100,filters:HrEmployeeListFilters={})=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.keyword)query.set("keyword",filters.keyword);if(filters.status)query.set("status",filters.status);return unwrap(apiRequest<PaginatedResult<HrEmployee>>(`/hr/employees?${query.toString()}`,{token}));},
 me:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrEmployee>("/hr/employees/me",{token,signal,skipUnauthorizedReset:true})),
 createEmployee:(body:object,token?:string)=>unwrap(apiRequest<HrEmployee>("/hr/employees",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()})),
 employee:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrEmployee>(`/hr/employees/${id}`,{token,signal})),
 updateEmployee:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrEmployee>(`/hr/employees/${id}`,{method:"PUT",body,token,idempotencyKey:crypto.randomUUID()})),
 events:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrEmploymentEvent[]>(`/hr/employees/${id}/events`,{token,signal})),
 employmentEventStatistics:(token:string|undefined,filters:{from:string;to:string},signal?:AbortSignal)=>{const query=new URLSearchParams(filters);return unwrap(apiRequest<HrEmploymentEventStatistics>(`/hr/employment-events/statistics?${query.toString()}`,{token,signal}));},
 workforceDecisionSnapshot:(token:string|undefined,filters:{from:string;to:string},signal?:AbortSignal)=>{const query=new URLSearchParams(filters);return unwrap(apiRequest<HrWorkforceDecisionSnapshot>(`/hr/decision-center/workforce?${query.toString()}`,{token,signal}));},
 profile:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrEmployeeProfile|null>(`/hr/employees/${id}/profile`,{token,signal})),
 myProfile:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrEmployeeProfile|null>("/hr/employees/me/profile",{token,signal,skipUnauthorizedReset:true})),
 updateProfile:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrEmployeeProfile>(`/hr/employees/${id}/profile`,{method:"PUT",body,token,idempotencyKey:crypto.randomUUID()})),
 transition:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrEmployee>(`/hr/employees/${id}/transitions`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()})),
 positions:(token?:string)=>unwrap(apiRequest<HrPosition[]>("/hr/positions",{token})),
 createPosition:(body:object,token?:string)=>unwrap(apiRequest<HrPosition>("/hr/positions",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,contracts:(token?:string,page=1,pageSize=20,filters:HrContractListFilters={},selfOnly=false,signal?:AbortSignal)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(filters.keyword)query.set("keyword",filters.keyword);if(filters.status)query.set("status",filters.status);if(filters.expiryFrom)query.set("expiry_from",filters.expiryFrom);if(filters.expiryTo)query.set("expiry_to",filters.expiryTo);return unwrap(apiRequest<PaginatedResult<HrContract>>(`/hr/contracts${selfOnly?"/me":""}?${query.toString()}`,{token,signal}));}
 ,contract:(id:string,token?:string)=>unwrap(apiRequest<HrContractDetail>(`/hr/contracts/${id}`,{token}))
 ,contractTypes:(token?:string)=>unwrap(apiRequest<HrContractType[]>("/hr/contract-types",{token}))
 ,contractReminders:(token?:string,page=1,pageSize=100,status?:HrContractReminderStatus,signal?:AbortSignal)=>{const query=new URLSearchParams({page:String(page),page_size:String(pageSize)});if(status)query.set("status",status);return unwrap(apiRequest<PaginatedResult<HrContractReminder>>(`/hr/contract-reminders?${query.toString()}`,{token,signal}));}
 ,runContractReminders:(token?:string)=>unwrap(apiRequest<{created:number}>("/hr/contract-reminders/run",{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-contract-reminder-run")}))
 ,actContractReminder:(id:string,action:HrContractReminderAction,token?:string)=>unwrap(apiRequest<{id:string;status:HrContractReminderStatus}>(`/hr/contract-reminders/${id}/actions`,{method:"POST",body:{action},token,idempotencyKey:createIdempotencyKey(`hr-contract-reminder-${action}`)}))
 ,createContract:(body:object,token?:string)=>unwrap(apiRequest<HrContract>("/hr/contracts",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,updateContract:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrContract>(`/hr/contracts/${id}`,{method:"PUT",body,token,idempotencyKey:crypto.randomUUID()}))
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
 ,goalCycles:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrGoalCycle[]>("/hr/goal-cycles",{token,signal}))
 ,goalOptions:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrGoalOptions>("/hr/goals/options",{token,signal}))
 ,createGoalCycle:(body:object,token?:string)=>unwrap(apiRequest<HrGoalCycle>("/hr/goal-cycles",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,goals:(selfOnly:boolean,token?:string,filters:{cycleId?:string;status?:string}={},signal?:AbortSignal)=>{const query=new URLSearchParams();if(filters.cycleId)query.set("cycle_id",filters.cycleId);if(filters.status)query.set("status",filters.status);const suffix=query.size?`?${query.toString()}`:"";return unwrap(apiRequest<HrGoal[]>(`${selfOnly?"/hr/goals/me":"/hr/goals"}${suffix}`,{token,signal}));}
 ,createGoal:(body:object,token?:string)=>unwrap(apiRequest<HrGoal>("/hr/goals",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,changeGoal:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrGoal>(`/hr/goals/${id}`,{method:"PUT",body,token,idempotencyKey:crypto.randomUUID()}))
 ,goalCheckins:(id:string,token?:string)=>unwrap(apiRequest<HrGoalCheckin[]>(`/hr/goals/${id}/checkins`,{token}))
 ,createGoalCheckin:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrGoalCheckin>(`/hr/goals/${id}/checkins`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,myWorkReports:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrWorkReport[]>("/hr/work-reports/me",{token,signal}))
 ,createWorkReport:(body:object,token?:string)=>unwrap(apiRequest<HrWorkReport>("/hr/work-reports/me",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,updateWorkReport:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrWorkReport>(`/hr/work-reports/${id}`,{method:"PUT",body,token,idempotencyKey:crypto.randomUUID()}))
 ,cancelWorkReport:(id:string,token?:string)=>unwrap(apiRequest<{id:string;cancelled:true}>(`/hr/work-reports/${id}`,{method:"DELETE",token,idempotencyKey:crypto.randomUUID()}))
 ,submitWorkReport:(id:string,token?:string)=>unwrap(apiRequest<HrWorkReport>(`/hr/work-reports/${id}/submit`,{method:"POST",token,idempotencyKey:crypto.randomUUID()}))
 ,teamWorkReports:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrWorkReport[]>("/hr/work-reports/team",{token,signal}))
 ,reviewWorkReport:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrWorkReport>(`/hr/work-reports/${id}/review`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,workReportActions:(id:string,token?:string)=>unwrap(apiRequest<HrWorkReportAction[]>(`/hr/work-reports/${id}/actions`,{token}))
 ,performanceCycles:(token?:string)=>unwrap(apiRequest<HrPerformanceCycle[]>("/hr/performance/cycles",{token}))
 ,createPerformanceCycle:(body:object,token?:string)=>unwrap(apiRequest<HrPerformanceCycle>("/hr/performance/cycles",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,createPerformancePlan:(body:object,token?:string)=>unwrap(apiRequest<HrPerformancePlan>("/hr/performance/plans",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,myPerformancePlans:(token?:string)=>unwrap(apiRequest<HrPerformancePlan[]>("/hr/performance/plans/me",{token}))
 ,teamPerformancePlans:(token?:string)=>unwrap(apiRequest<HrPerformancePlan[]>("/hr/performance/plans/team",{token}))
 ,selfReviewPerformance:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrPerformancePlan>(`/hr/performance/plans/${id}/self-review`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,managerReviewPerformance:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrPerformancePlan>(`/hr/performance/plans/${id}/manager-review`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,calibratePerformance:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrPerformancePlan>(`/hr/performance/plans/${id}/calibrate`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,performanceTemplatesV2:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrPerformanceTemplateV2[]>("/hr/performance-v2/templates",{token,signal}))
 ,performanceOptionsV2:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<{orgs:Array<{id:string;orgName:string}>;templates:Array<{id:string;templateName:string;versionName:string}>}>("/hr/performance-v2/options",{token,signal}))
 ,performanceCyclesV2:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrPerformanceCycleV2[]>("/hr/performance-v2/cycles",{token,signal}))
 ,createPerformanceTemplateV2:(body:object,token?:string)=>unwrap(apiRequest<HrPerformanceTemplateV2>("/hr/performance-v2/templates",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-perf-template-create")}))
 ,publishPerformanceTemplateV2:(id:string,token?:string)=>unwrap(apiRequest(`/hr/performance-v2/templates/${id}/publish`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-perf-template-publish")}))
 ,createPerformanceCycleV2:(body:object,token?:string)=>unwrap(apiRequest<HrPerformanceCycleV2>("/hr/performance-v2/cycles",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-perf-cycle-create")}))
 ,publishPerformanceCycleV2:(id:string,token?:string)=>unwrap(apiRequest(`/hr/performance-v2/cycles/${id}/publish`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-perf-cycle-publish")}))
 ,performanceReviewsV2:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrPerformanceReviewV2[]>("/hr/performance-v2/reviews",{token,signal}))
 ,performanceCalibrationOptionsV2:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<{users:Array<{id:string;displayName:string}>}>("/hr/performance-v2/calibration-options",{token,signal}))
 ,performanceCalibrationBatchesV2:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<Array<{id:string;cycleId:string;batchName:string;meetingAt:string;status:string;canAct:boolean}>>("/hr/performance-v2/calibration-batches",{token,signal}))
 ,submitPerformanceSelfReviewV2:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/performance-v2/reviews/${id}/self-review`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-perf-self-review")}))
 ,submitPerformanceManagerReviewV2:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/performance-v2/reviews/${id}/manager-review`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-perf-manager-review")}))
 ,createPerformanceCalibrationBatchV2:(body:object,token?:string)=>unwrap(apiRequest<{id:string;status:string}>("/hr/performance-v2/calibration-batches",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-perf-calibration-batch")}))
 ,addPerformanceCalibrationEntryV2:(batchId:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/performance-v2/calibration-batches/${batchId}/entries`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-perf-calibration-entry")}))
 ,completePerformanceCalibrationBatchV2:(batchId:string,token?:string)=>unwrap(apiRequest(`/hr/performance-v2/calibration-batches/${batchId}/complete`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-perf-calibration-complete")}))
 ,acknowledgePerformanceReviewV2:(id:string,token?:string)=>unwrap(apiRequest(`/hr/performance-v2/reviews/${id}/acknowledge`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-perf-acknowledge")}))
 ,appealPerformanceReviewV2:(id:string,reason:string,token?:string)=>unwrap(apiRequest<{id:string;status:string}>(`/hr/performance-v2/reviews/${id}/appeals`,{method:"POST",body:{reason},token,idempotencyKey:createIdempotencyKey("hr-perf-appeal")}))
 ,resolvePerformanceAppealV2:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/performance-v2/appeals/${id}/resolve`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-perf-appeal-resolve")}))
 ,createFeedbackCycle:(body:object,token?:string)=>unwrap(apiRequest<{id:string}>("/hr/feedback/cycles",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,feedbackCycles:(token?:string)=>unwrap(apiRequest<HrFeedbackCycle[]>("/hr/feedback/cycles",{token}))
 ,createFeedbackAssignment:(body:object,token?:string)=>unwrap(apiRequest<HrFeedbackAssignment>("/hr/feedback/assignments",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,myFeedbackAssignments:(token?:string)=>unwrap(apiRequest<HrFeedbackAssignment[]>("/hr/feedback/assignments/me",{token}))
 ,submitFeedback:(id:string,body:object,token?:string)=>unwrap(apiRequest<{id:string}>(`/hr/feedback/assignments/${id}/submit`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,feedback360Options:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrFeedback360Options>("/hr/feedback360-v2/options",{token,signal}))
 ,feedback360Models:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<Array<{id:string;modelCode:string;modelName:string;status:string;versionId:string;versionName:string;versionStatus:string;dimensions:unknown[]}>>("/hr/feedback360-v2/models",{token,signal}))
 ,createFeedback360Model:(body:object,token?:string)=>unwrap(apiRequest<{id:string;versionId:string;status:string}>("/hr/feedback360-v2/models",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-feedback360-model")}))
 ,publishFeedback360Model:(id:string,token?:string)=>unwrap(apiRequest(`/hr/feedback360-v2/models/${id}/publish`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-feedback360-model-publish")}))
 ,createFeedback360Questionnaire:(body:object,token?:string)=>unwrap(apiRequest<{id:string;versionId:string;status:string}>("/hr/feedback360-v2/questionnaires",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-feedback360-questionnaire")}))
 ,publishFeedback360Questionnaire:(id:string,token?:string)=>unwrap(apiRequest(`/hr/feedback360-v2/questionnaires/${id}/publish`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-feedback360-questionnaire-publish")}))
 ,feedback360Cycles:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrFeedback360Cycle[]>("/hr/feedback360-v2/cycles",{token,signal}))
 ,createFeedback360Cycle:(body:object,token?:string)=>unwrap(apiRequest<{id:string;status:string}>("/hr/feedback360-v2/cycles",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-feedback360-cycle")}))
 ,activateFeedback360Cycle:(id:string,token?:string)=>unwrap(apiRequest(`/hr/feedback360-v2/cycles/${id}/activate`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-feedback360-cycle-activate")}))
 ,nominateFeedback360:(body:object,token?:string)=>unwrap(apiRequest<{id:string;status:string}>("/hr/feedback360-v2/nominations",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-feedback360-nominate")}))
 ,feedback360PendingNominations:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrFeedback360Nomination[]>("/hr/feedback360-v2/nominations/pending",{token,signal}))
 ,decideFeedback360Nomination:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/feedback360-v2/nominations/${id}/decision`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-feedback360-nomination-decision")}))
 ,myFeedback360Assignments:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrFeedback360Task[]>("/hr/feedback360-v2/assignments/me",{token,signal}))
 ,submitFeedback360:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/feedback360-v2/assignments/${id}/submit`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-feedback360-submit")}))
 ,closeFeedback360Subject:(id:string,token?:string)=>unwrap(apiRequest(`/hr/feedback360-v2/subjects/${id}/close`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-feedback360-close")}))
 ,publishFeedback360Result:(id:string,token?:string)=>unwrap(apiRequest(`/hr/feedback360-v2/subjects/${id}/publish`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-feedback360-publish")}))
 ,feedback360Results:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrFeedback360Result[]>("/hr/feedback360-v2/results",{token,signal}))
 ,talentOptions:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrTalentOptions>("/hr/talent/options",{token,signal}))
 ,talentProfiles:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrTalentProfile[]>("/hr/talent/profiles",{token,signal}))
 ,createTalentProfile:(body:object,token?:string)=>unwrap(apiRequest<{id:string}>("/hr/talent/profiles",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-talent-profile")}))
 ,talentSessions:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrTalentSession[]>("/hr/talent/sessions",{token,signal}))
 ,talentSubjects:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrTalentSubject[]>(`/hr/talent/sessions/${id}/subjects`,{token,signal}))
 ,createTalentSession:(body:object,token?:string)=>unwrap(apiRequest<{id:string;status:string}>("/hr/talent/sessions",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-talent-session")}))
 ,activateTalentSession:(id:string,token?:string)=>unwrap(apiRequest(`/hr/talent/sessions/${id}/activate`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-talent-activate")}))
 ,closeTalentSession:(id:string,token?:string)=>unwrap(apiRequest(`/hr/talent/sessions/${id}/close`,{method:"POST",token,idempotencyKey:createIdempotencyKey("hr-talent-close")}))
 ,decideTalentSubject:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/talent/subjects/${id}/decisions`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-talent-decision")}))
 ,talentSuccession:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrSuccessionRow[]>("/hr/talent/succession",{token,signal}))
 ,createCriticalPosition:(body:object,token?:string)=>unwrap(apiRequest("/hr/talent/critical-positions",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-critical-position")}))
 ,createSuccessor:(body:object,token?:string)=>unwrap(apiRequest("/hr/talent/succession",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-successor")}))
 ,developmentPlans:(token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrDevelopmentPlan[]>("/hr/talent/development-plans",{token,signal}))
 ,createDevelopmentPlan:(body:object,token?:string)=>unwrap(apiRequest<{id:string}>("/hr/talent/development-plans",{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-development-plan")}))
 ,transitionDevelopmentPlan:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/talent/development-plans/${id}/transitions`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-development-plan-transition")}))
 ,addDevelopmentAction:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/talent/development-plans/${id}/actions`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-development-action")}))
 ,transitionDevelopmentAction:(id:string,body:object,token?:string)=>unwrap(apiRequest(`/hr/talent/development-actions/${id}/transitions`,{method:"POST",body,token,idempotencyKey:createIdempotencyKey("hr-development-transition")}))
 ,compensationPlans:(token?:string)=>unwrap(apiRequest<HrCompensationPlan[]>("/hr/compensation/plans",{token}))
 ,createCompensationPlan:(body:object,token?:string)=>unwrap(apiRequest<HrCompensationPlan>("/hr/compensation/plans",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,assignCompensation:(body:object,token?:string)=>unwrap(apiRequest<{id:string}>("/hr/compensation/assignments",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,payrollPeriods:(token?:string)=>unwrap(apiRequest<HrPayrollPeriod[]>("/hr/payroll/periods",{token}))
 ,createPayrollPeriod:(body:object,token?:string)=>unwrap(apiRequest<HrPayrollPeriod>("/hr/payroll/periods",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,payrollRuns:(token?:string)=>unwrap(apiRequest<HrPayrollRun[]>("/hr/payroll/runs",{token}))
 ,payrollRunPayslips:(id:string,token?:string,signal?:AbortSignal)=>unwrap(apiRequest<HrPayslip[]>(`/hr/payroll/runs/${id}/payslips`,{token,signal}))
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
 ,reviewPayrollFormula: (
    id: string,
    body: { decision: "approve_for_simulation" | "reject"; reason: string },
    token?: string,
  ) =>
    unwrap(
      apiRequest<HrPayrollFormula>(
        `/hr/payroll/history-formulas/${id}/review`,
        { method: "POST", body, token, idempotencyKey: crypto.randomUUID() },
      ),
    ),
payrollReconciliations: (
    token?: string,
    page = 1,
    pageSize = 20,
    signal?: AbortSignal,
  ) =>
    unwrap(
      apiRequest<PaginatedResult<HrPayrollReconciliation>>(
        `/hr/payroll/reconciliations?page=${page}&page_size=${pageSize}`,
        { token, signal },
      ),
    ),
payrollReconciliation: (
    id: string,
    token?: string,
    signal?: AbortSignal,
    resultPage = 1,
    resultPageSize = 20,
  ) =>
    unwrap(
      apiRequest<HrPayrollReconciliation>(
        `/hr/payroll/reconciliations/${id}?result_page=${resultPage}&result_page_size=${resultPageSize}`,
        { token, signal },
      ),
    ),
payrollReconciliationSetup: (token?: string, signal?: AbortSignal) =>
    unwrap(
      apiRequest<HrPayrollReconciliationSetup>(
        "/hr/payroll/reconciliations/setup",
        { token, signal },
      ),
    ),
createPayrollReconciliationPolicy: (
    body: {
      bookId: string;
      netItemVersionId: string;
      toleranceAmount: string;
      reason: string;
    },
    token?: string,
  ) =>
    unwrap(
      apiRequest("/hr/payroll/reconciliation-policies", {
        method: "POST",
        body,
        token,
        idempotencyKey: crypto.randomUUID(),
      }),
    ),
simulatePayrollReconciliation: (
    body: {
      legacyBatchId: string;
      attendanceInputBatchId: string;
      supersedesRunId?: string;
    },
    token?: string,
  ) =>
    unwrap(
      apiRequest<HrPayrollReconciliation>(
        "/hr/payroll/reconciliations/simulate",
        { method: "POST", body, token, idempotencyKey: crypto.randomUUID() },
      ),
    ),
reviewPayrollReconciliation: (
    id: string,
    body: {
      decision: string;
      comment: string;
      resultId?: string;
      itemDifferenceId?: string;
    },
    token?: string,
  ) =>
    unwrap(
      apiRequest<HrPayrollReviewAction>(
        `/hr/payroll/reconciliations/${id}/review-actions`,
        { method: "POST", body, token, idempotencyKey: crypto.randomUUID() },
      ),
    )
 ,myApprovals:(token?:string)=>unwrap(apiRequest<HrApproval[]>("/hr/approvals/me",{token}))
 ,pendingApprovals:(token?:string)=>unwrap(apiRequest<HrApproval[]>("/hr/approvals/pending",{token}))
 ,createApproval:(body:object,token?:string)=>unwrap(apiRequest<HrApproval>("/hr/approvals",{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,approvalAction:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrApproval>(`/hr/approvals/${id}/actions`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
 ,reviewApproval:(id:string,body:object,token?:string)=>unwrap(apiRequest<HrApproval>(`/hr/approvals/${id}/review`,{method:"POST",body,token,idempotencyKey:crypto.randomUUID()}))
};
