import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import {
  HR_CUSTOM_FIELD_COVERAGE_STATUSES,
  HR_CUSTOM_FIELD_REVIEW_REASON_CODES,
  HR_CUSTOM_FIELD_REVIEW_STATUSES,
  HR_CUSTOM_FIELD_RULE_CLASSIFICATIONS
} from "../entities/hr-custom-field-definition.entity";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class HrCustomFieldDefinitionQueryDto {
  @Transform(({ value }) => Number(value ?? 1)) @IsInt() @Min(1) page = 1;
  @Transform(({ value }) => Number(value ?? 20)) @IsInt() @Min(1) @Max(100) page_size = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(HR_CUSTOM_FIELD_RULE_CLASSIFICATIONS) classification?: string;
  @IsOptional() @IsIn(HR_CUSTOM_FIELD_REVIEW_STATUSES) review_status?: string;
  @IsOptional() @IsIn(HR_CUSTOM_FIELD_COVERAGE_STATUSES) coverage_status?: string;
}

export class ReviewHrCustomFieldDefinitionDto {
  @IsIn(HR_CUSTOM_FIELD_RULE_CLASSIFICATIONS) classification!: string;
  @IsIn(HR_CUSTOM_FIELD_REVIEW_STATUSES) reviewStatus!: string;
  @IsIn(HR_CUSTOM_FIELD_COVERAGE_STATUSES) coverageStatus!: string;
  @IsOptional() @Transform(trim) @Matches(/^[a-z][a-z0-9_.-]{0,127}$/) targetFieldKey?: string;
  @IsOptional() @IsIn(HR_CUSTOM_FIELD_REVIEW_REASON_CODES) reviewReasonCode?: string;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(0) expectedVersion!: number;
}
