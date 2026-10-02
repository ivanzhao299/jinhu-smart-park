import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { HR_INSURANCE_KINDS } from "../hr-insurance-calculation";

export class HrInsurancePreviewBaseDto {
  @IsIn(HR_INSURANCE_KINDS) insuranceKind!: typeof HR_INSURANCE_KINDS[number];
  @IsString() @Matches(/^\d{1,16}(?:\.\d{1,2})?$/u) contributionBase!: string;
}

export class CreateHrInsuranceReferencePreviewDto {
  @IsUUID() policyId!: string;
  @IsInt() @Min(1) @Max(2147483647) expectedPolicyVersion!: number;
  @IsIn([1, 2]) variantNo!: number;
  @IsUUID() employeeId!: string;
  @IsInt() @Min(1900) @Max(2100) periodYear!: number;
  @IsInt() @Min(1) @Max(12) periodMonth!: number;
  @IsBoolean() includeFund!: boolean;
  @IsArray() @ArrayMinSize(6) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => HrInsurancePreviewBaseDto)
  bases!: HrInsurancePreviewBaseDto[];
}

export class HrInsurancePolicyQueryDto {
  @Transform(({ value }) => Number(value ?? 1)) @IsInt() @Min(1) @Max(1000000) page = 1;
  @Transform(({ value }) => Number(value ?? 20)) @IsInt() @Min(1) @Max(100) page_size = 20;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
}
