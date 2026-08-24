import { Transform } from "class-transformer";
import { IsArray,IsDateString,IsEmail,IsIn,IsInt,IsNumber,IsObject,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min } from "class-validator";
import { HR_EMPLOYEE_STATUSES,HR_EMPLOYMENT_TYPES } from "@jinhu/shared";

const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;
const money=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;
const MONEY_PATTERN=/^(0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
export class HrListQueryDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?:string;
 @IsOptional() @IsIn(HR_EMPLOYEE_STATUSES) status?:string;
 @IsOptional() @IsUUID() org_id?:string;
}
export class HrContractListQueryDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?:string;
 @IsOptional() @IsIn(["draft","active","expired","terminated","cancelled","needs_review"]) status?:string;
 @IsOptional() @IsDateString() expiry_from?:string;
 @IsOptional() @IsDateString() expiry_to?:string;
}
export class HrAttendanceCalendarQueryDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1900) @Max(2200) year?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(12) month?:number;
}
export class HrInsurancePeriodQueryDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?:string;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1900) @Max(2200) year?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(12) month?:number;
 @IsOptional() @Transform(({value})=>value==="true"?true:value==="false"?false:value) @IsIn([true,false]) needs_review?:boolean;
}
export class HrAttendanceRequestListQueryDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @IsIn(["leave","overtime","business_trip","correction"]) type?:string;
 @IsOptional() @IsIn(["draft","submitted","approved","returned","cancelled"]) status?:string;
}
export class CreateHrAttendanceRequestDto {
 @IsIn(["leave","overtime","business_trip","correction"]) requestType!:string;
 @IsOptional() @IsDateString({strict:true}) startAt?:string;
 @IsOptional() @IsDateString({strict:true}) endAt?:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() attendanceDate?:string;
 @Transform(trim) @IsString() @MaxLength(2000) reason!:string;
}
export class ReviewHrAttendanceRequestDto { @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string; }
export class HrAttendanceDailyQueryDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1; @Transform(({value})=>Number(value??31)) @IsInt() @Min(1) @Max(100) page_size=31;
 @IsOptional() @IsDateString() from?:string; @IsOptional() @IsDateString() to?:string; @IsOptional() @IsIn(["normal","late","early_leave","missing_punch","absence","rest","corrected"]) status?:string;
}
export class CreateHrAttendanceShiftDto { @Transform(trim) @IsString() @MaxLength(64) shiftCode!:string;@Transform(trim) @IsString() @MaxLength(100) shiftName!:string;@Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startLocal!:string;@Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endLocal!:string;@IsOptional() @IsInt() @Min(0) @Max(240) lateGraceMinutes?:number;@IsOptional() @IsInt() @Min(0) @Max(240) earlyGraceMinutes?:number;@Transform(trim) @IsString() @MaxLength(32) ruleVersion!:string; }
export class CreateHrEmployeeScheduleDto { @IsUUID() employeeId!:string;@IsUUID() shiftId!:string;@IsDateString() workDate!:string; }
export class CreateHrAttendancePunchDto { @IsUUID() employeeId!:string;@Transform(trim) @IsString() @MaxLength(160) eventKey!:string;@IsDateString({strict:true}) occurredAt!:string;@IsIn(["clock_in","clock_out","unknown"]) eventType!:string;@IsIn(["terminal","mobile","import","manual"]) source!:string;@IsOptional() @Transform(trim) @IsString() @MaxLength(100) deviceCode?:string; }
export class RecalculateHrAttendanceDto { @IsUUID() employeeId!:string;@IsDateString() workDate!:string;@Transform(trim) @IsString() @MaxLength(32) ruleVersion!:string; }
export class CreateHrAttendancePeriodDto { @Matches(/^\d{4}-\d{2}-01$/) periodMonth!:string; }
export class HrAttendancePeriodQueryDto { @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;@Transform(({value})=>Number(value??24)) @IsInt() @Min(1) @Max(100) page_size=24;@IsOptional() @IsIn(["open","calculating","review","closed","failed"]) status?:string; }
export class HrAttendanceMonthSummaryQueryDto { @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;@Transform(({value})=>Number(value??100)) @IsInt() @Min(1) @Max(100) page_size=100; }
export class CreateHrAttendanceCorrectionBatchDto { @Transform(trim) @IsString() @MaxLength(1000) reason!:string; }
export class CreateHrContractDto {
 @IsUUID() employeeId!:string;
 @IsUUID() contractTypeId!:string;
 @Transform(trim) @IsString() @MaxLength(64) contractNo!:string;
 @IsDateString() startDate!:string;
 @IsOptional() @IsDateString() endDate?:string;
 @IsOptional() @IsDateString() probationEndDate?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?:string;
}
export class CreateHrContractChangeDto {
 @IsIn(["renewal","amendment","termination","correction"]) changeType!:string;
 @IsDateString() newStartDate!:string;
 @IsOptional() @IsDateString() newEndDate?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?:string;
}
export class HrContractActionDto { @IsIn(["activate","cancel"]) action!:string; }
export class HrContractChangeActionDto { @IsIn(["apply","cancel"]) action!:string; }
export class CreateHrPositionDto {
 @IsUUID() orgId!:string; @Transform(trim) @IsString() @MaxLength(64) positionCode!:string;
 @Transform(trim) @IsString() @MaxLength(100) positionName!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(64) jobFamily?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(32) jobLevel?:string;
 @IsOptional() @IsInt() @Min(0) headcountLimit?:number;
 @IsOptional() @IsIn(["enabled","disabled"]) status?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?:string;
}
export class CreateHrEmployeeDto {
 @Transform(trim) @IsString() @MaxLength(64) employeeCode!:string;
 @Transform(trim) @IsString() @MaxLength(100) fullName!:string;
 @IsOptional() @IsUUID() userId?:string; @IsOptional() @IsUUID() primaryOrgId?:string;
 @IsOptional() @IsUUID() positionId?:string; @IsOptional() @IsUUID() managerEmployeeId?:string;
 @IsOptional() @IsIn(HR_EMPLOYMENT_TYPES) employmentType?:string;
 @IsOptional() @IsIn(HR_EMPLOYEE_STATUSES) employmentStatus?:string;
 @IsOptional() @IsDateString() hireDate?:string; @IsOptional() @IsDateString() probationEndDate?:string;
 @IsOptional() @IsDateString() departureDate?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(128) workLocation?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(32) workMobile?:string;
 @IsOptional() @Transform(trim) @IsEmail() @MaxLength(128) workEmail?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?:string;
}
export class UpdateHrEmployeeDto extends CreateHrEmployeeDto {}
export class UpdateHrEmployeeProfileDto {
 @IsOptional() @IsIn(["resident_id","passport","other"]) idType?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(64) idNumberMasked?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(32) personalMobile?:string;
 @IsOptional() @Transform(trim) @IsEmail() @MaxLength(128) personalEmail?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(500) address?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) emergencyContactName?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(32) emergencyContactMobile?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?:string;
}
export class HrEmploymentTransitionDto {
 @IsIn(["start_probation","confirm_employment","transfer","suspend","resume","depart"]) action!:string;
 @IsDateString() effectiveDate!:string;
 @IsOptional() @IsUUID() primaryOrgId?:string;
 @IsOptional() @IsUUID() positionId?:string;
 @IsOptional() @IsUUID() managerEmployeeId?:string;
 @Transform(trim) @IsString() @MaxLength(500) reason!:string;
}
export class CreateHrGoalCycleDto {
 @Transform(trim) @IsString() @MaxLength(64) cycleCode!:string; @Transform(trim) @IsString() @MaxLength(100) cycleName!:string;
 @IsDateString() startDate!:string; @IsDateString() endDate!:string;
}
export class CreateHrGoalDto {
 @IsUUID() cycleId!:string; @IsOptional() @IsUUID() parentGoalId?:string; @IsIn(["group","department","employee"]) goalLevel!:string;
 @Transform(trim) @IsString() @MaxLength(200) goalName!:string; @IsOptional() @IsUUID() ownerOrgId?:string; @IsOptional() @IsUUID() ownerEmployeeId?:string;
 @Transform(({value})=>Number(value)) @IsNumber() @Min(0.0001) @Max(1) weight!:number;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) metricName?:string; @IsOptional() @Transform(({value})=>Number(value)) @IsNumber() targetValue?:number;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(32) unit?:string; @IsDateString() startDate!:string; @IsDateString() dueDate!:string;
}
export class CreateHrWorkReportDto {
 @IsIn(["daily","weekly","monthly"]) reportType!:string; @IsDateString() periodStart!:string; @IsDateString() periodEnd!:string;
 @Transform(trim) @IsString() @MaxLength(10000) completedWork!:string; @IsOptional() @Transform(trim) @IsString() @MaxLength(10000) nextPlan?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) risks?:string; @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) collaborationNeeds?:string;
 @IsOptional() @Transform(({value})=>Number(value)) @IsNumber() @Min(0) @Max(744) hours?:number;
 @IsOptional() @IsArray() @IsUUID("4",{each:true}) goalIds?:string[];
}
export class ReviewHrWorkReportDto { @IsIn(["confirmed","returned"]) action!:string; @Transform(trim) @IsString() @MaxLength(1000) comment!:string; }
export class CreateHrGoalCheckinDto {
 @Transform(({value})=>Number(value)) @IsNumber() @Min(0) @Max(1) progress!:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsNumber() currentValue?:number;
 @Transform(trim) @IsString() @MaxLength(2000) summary!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) risks?:string;
 @IsOptional() @IsUUID() evidenceFileId?:string;
}
export class CreateHrPerformanceCycleDto {
 @Transform(trim) @IsString() @MaxLength(64) cycleCode!:string; @Transform(trim) @IsString() @MaxLength(100) cycleName!:string;
 @IsDateString() startDate!:string; @IsDateString() endDate!:string; @IsOptional() @IsDateString() selfReviewEnd?:string; @IsOptional() @IsDateString() managerReviewEnd?:string; @IsOptional() @IsDateString() calibrationEnd?:string;
}
export class CreateHrPerformancePlanDto { @IsUUID() cycleId!:string; @IsUUID() employeeId!:string; }
export class ScoreHrPerformanceDto { @Transform(({value})=>Number(value)) @IsNumber() @Min(0) @Max(100) score!:number; @Transform(trim) @IsString() @MaxLength(4000) comment!:string; }
export class CreateHrFeedbackCycleDto { @IsUUID() performanceCycleId!:string; @Transform(trim) @IsString() @MaxLength(100) cycleName!:string; @IsOptional() anonymous?:boolean; @IsOptional() @IsInt() @Min(2) @Max(20) minimumAnonymousResponses?:number; }
export class CreateHrFeedbackAssignmentDto { @IsUUID() feedbackCycleId!:string; @IsUUID() subjectEmployeeId!:string; @IsUUID() reviewerEmployeeId!:string; @IsIn(["self","manager","peer","subordinate"]) relationType!:string; @Transform(({value})=>Number(value)) @IsNumber() @Min(0.0001) @Max(1) weight!:number; }
export class SubmitHrFeedbackDto { @Transform(({value})=>Number(value)) @IsNumber() @Min(0) @Max(100) score!:number; @IsOptional() @Transform(trim) @IsString() @MaxLength(3000) strengths?:string; @IsOptional() @Transform(trim) @IsString() @MaxLength(3000) improvements?:string; }
export class CreateHrCompensationPlanDto { @Transform(trim) @IsString() @MaxLength(64) planCode!:string;@Transform(trim) @IsString() @MaxLength(100) planName!:string;@IsDateString() effectiveFrom!:string;@IsOptional() @IsDateString() effectiveTo?:string; }
export class AssignHrCompensationDto { @IsUUID() employeeId!:string;@IsUUID() planId!:string;@IsDateString() effectiveFrom!:string;@IsOptional() @IsDateString() effectiveTo?:string;@Transform(money) @IsString() @Matches(MONEY_PATTERN) baseSalary!:string;@IsOptional() @Transform(money) @IsString() @Matches(MONEY_PATTERN) allowanceAmount?:string;@IsOptional() @Transform(money) @IsString() @Matches(MONEY_PATTERN) variableTarget?:string; }
export class CreateHrPayrollPeriodDto { @IsDateString() periodMonth!:string;@IsDateString() startDate!:string;@IsDateString() endDate!:string; }
export class CreateHrPayrollRunDto { @IsUUID() periodId!:string;@IsOptional() @IsUUID() correctionOfRunId?:string; }
export class AdjustHrPayslipDto { @Transform(money) @IsString() @Matches(MONEY_PATTERN) deductionAmount!:string;@Transform(money) @IsString() @Matches(MONEY_PATTERN) personalTax!:string;@Transform(trim) @IsString() @MaxLength(500) reason!:string; }
export class CreateHrApprovalDto { @IsIn(["employment_change","profile_change","compensation_change"]) requestType!:string;@Transform(trim) @IsString() @MaxLength(200) title!:string;@IsObject() payload!:Record<string,unknown>; }
export class HrApprovalActionDto { @IsIn(["submit","approve","return","withdraw","resubmit"]) action!:string;@IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string; }
