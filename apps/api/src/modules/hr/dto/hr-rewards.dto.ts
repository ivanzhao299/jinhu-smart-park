import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const DECIMAL = /^(0|[1-9]\d{0,15})(\.\d{1,4})?$/;
export class HrRewardListDto {
  @Transform(({ value }) => Number(value ?? 1)) @IsInt() @Min(1) page = 1;
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
  @IsOptional()
  @IsIn(["draft", "submitted", "approved", "returned", "withdrawn"])
  status?: string;
}
export class CreateHrRewardCategoryDto {
  @Transform(trim) @IsString() @MaxLength(64) code!: string;
  @IsIn(["reward", "discipline"]) kind!: string;
  @Transform(trim) @IsString() @MaxLength(120) name!: string;
  @IsIn(["minor", "normal", "major", "critical"]) impactLevel!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;
}
export class VersionHrRewardCategoryDto {
  @IsIn(["reward", "discipline"]) kind!: string;
  @Transform(trim) @IsString() @MaxLength(120) name!: string;
  @IsIn(["minor", "normal", "major", "critical"]) impactLevel!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;
}
export class CreateHrRewardCaseDto {
  @Transform(trim) @IsString() @MaxLength(64) code!: string;
  @IsUUID() employeeId!: string;
  @IsUUID() categoryId!: string;
  @IsDateString() occurredOn!: string;
  @Transform(trim) @IsString() @MaxLength(300) factSummary!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(3000)
  detailedReason?: string;
  @IsIn(["minor", "normal", "major", "critical"]) impactLevel!: string;
  @IsOptional() @Transform(trim) @Matches(DECIMAL) amountSuggestion?: string;
  @IsOptional() @Transform(trim) @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  evidenceFileIds!: string[];
}
export class UpdateHrRewardDraftDto {
  @IsDateString() occurredOn!: string;
  @Transform(trim) @IsString() @MaxLength(300) factSummary!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(3000)
  detailedReason?: string;
  @IsIn(["minor", "normal", "major", "critical"]) impactLevel!: string;
  @IsOptional() @Transform(trim) @Matches(DECIMAL) amountSuggestion?: string;
  @IsOptional() @Transform(trim) @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  evidenceFileIds?: string[];
}
export class HrRewardReviewDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}
export class HrRewardCorrectionDto {
  @IsIn(["correction", "appeal"]) type!: string;
  @Transform(trim) @IsString() @MaxLength(300) summary!: string;
  @Transform(trim) @IsString() @MaxLength(1000) reason!: string;
}
export class HrRewardLinkDto {
  @IsIn(["payroll_input", "performance_reference"]) targetType!: string;
  @IsUUID() targetId!: string;
  @IsInt() @Min(1) targetVersion!: number;
}
