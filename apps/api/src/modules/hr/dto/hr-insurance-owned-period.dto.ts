import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { HrInsurancePreviewBaseDto } from "./hr-insurance-preview.dto";

/** No client-supplied rates or amounts: the service resolves the immutable definition. */
export class CreateHrInsuranceOwnedPreviewDto {
  @IsUUID() requestId!: string;
  @IsUUID() employeeId!: string;
  @IsInt() @Min(1) @Max(2147483647) expectedEmployeeVersion!: number;
  @IsUUID() policyVersionId!: string;
  @IsString() @Matches(/^[0-9a-f]{64}$/u) expectedDefinitionHash!: string;
  @IsString() @Matches(/^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/u) periodMonth!: string;
  @IsBoolean() includeFund!: boolean;
  @IsArray() @ArrayMinSize(6) @ArrayMaxSize(6)
  @ArrayUnique((item: HrInsurancePreviewBaseDto) => item?.insuranceKind)
  @ValidateNested({ each: true }) @Type(() => HrInsurancePreviewBaseDto)
  bases!: HrInsurancePreviewBaseDto[];
}

export class ConfirmHrInsuranceOwnedPeriodDto {
  @IsUUID() requestId!: string;
  @IsUUID() previewId!: string;
  @IsString() @Matches(/^[0-9a-f]{64}$/u) expectedPreviewHash!: string;
  @IsString() @MinLength(1) @MaxLength(500) @Matches(/\S/u) reason!: string;
}

export class CorrectHrInsuranceOwnedPeriodDto extends ConfirmHrInsuranceOwnedPeriodDto {
  @IsUUID() previousRevisionId!: string;
  @IsInt() @Min(1) @Max(2147483647) expectedPeriodVersion!: number;
}

export class CloseHrInsuranceOwnedPeriodDto {
  @IsUUID() requestId!: string;
  @IsUUID() revisionId!: string;
  @IsInt() @Min(1) @Max(2147483647) expectedPeriodVersion!: number;
  @IsString() @MinLength(1) @MaxLength(500) @Matches(/\S/u) reason!: string;
}
