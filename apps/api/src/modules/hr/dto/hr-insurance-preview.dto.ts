import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsString, IsUUID, Matches, Max, Min, ValidateNested } from "class-validator";
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
