import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";

export class HrTalentQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() sessionId?: string;
}
export class CreateHrTalentProfileDto {
  @IsUUID() employeeId!: string;
  @IsDateString() asOfDate!: string;
}
export class CreateHrTalentReviewSessionDto {
  @IsString() @Length(2, 64) sessionCode!: string;
  @IsString() @Length(2, 160) sessionName!: string;
  @IsDateString() reviewDate!: string;
  @IsString() @Length(4, 1000) performanceDefinition!: string;
  @IsString() @Length(4, 1000) potentialDefinition!: string;
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("4", { each: true })
  employeeIds!: string[];
}
export class DecideHrTalentSubjectDto {
  @IsIn(["low", "medium", "high"]) performanceBand!: string;
  @IsIn(["low", "medium", "high"]) potentialBand!: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  potentialScore!: number;
  @IsString() @Length(4, 2000) reason!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) evidence?: Record<
    string,
    unknown
  >[];
}
export class CreateHrCriticalPositionDto {
  @IsUUID() positionId!: string;
  @IsIn(["important", "critical"]) criticality!: string;
  @IsIn(["low", "medium", "high"]) riskLevel!: string;
  @IsString() @Length(4, 2000) riskReason!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) evidence?: Record<
    string,
    unknown
  >[];
}
export class CreateHrSuccessionCandidateDto {
  @IsUUID() criticalPositionId!: string;
  @IsUUID() employeeId!: string;
  @IsIn(["ready_now", "ready_1_2_years", "ready_3_plus_years"])
  readiness!: string;
  @IsIn(["low", "medium", "high"]) riskLevel!: string;
  @IsString() @Length(4, 2000) riskReason!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) evidence?: Record<
    string,
    unknown
  >[];
}
export class CreateHrDevelopmentPlanDto {
  @IsUUID() employeeId!: string;
  @IsString() @Length(2, 64) planCode!: string;
  @IsString() @Length(2, 160) planName!: string;
  @IsString() @Length(4, 2000) developmentGoal!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
}
export class TransitionHrDevelopmentPlanDto {
  @IsIn(["activate", "complete", "cancel"]) action!: string;
  @IsOptional() @IsString() @Length(4, 2000) reason?: string;
}
export class CreateHrDevelopmentActionDto {
  @IsString() @Length(2, 200) actionName!: string;
  @IsUUID() ownerEmployeeId!: string;
  @IsDateString() dueDate!: string;
}
export class TransitionHrDevelopmentActionDto {
  @IsIn(["start", "complete", "cancel", "add_evidence"]) action!: string;
  @IsOptional() @IsString() @Length(2, 2000) note?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) evidence?: Record<
    string,
    unknown
  >[];
}
