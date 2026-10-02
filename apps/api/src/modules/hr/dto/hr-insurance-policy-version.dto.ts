import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from "class-validator";
import { HR_INSURANCE_KINDS } from "../hr-insurance-calculation";

export class HrInsurancePolicyFactorDto {
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,6})?$/u) rate!: string;
  @ValidateIf((_object, value) => value !== null)
  @IsString() @Matches(/^-?\d{1,15}(?:\.\d{1,3})?$/u) fixedAmount!: string | null;
}
export class HrInsurancePolicyComponentsDto {
  @ValidateNested() @Type(() => HrInsurancePolicyFactorDto) base!: HrInsurancePolicyFactorDto;
  @ValidateNested() @Type(() => HrInsurancePolicyFactorDto) employer!: HrInsurancePolicyFactorDto;
  @ValidateNested() @Type(() => HrInsurancePolicyFactorDto) employee!: HrInsurancePolicyFactorDto;
  @ValidateNested() @Type(() => HrInsurancePolicyFactorDto) supplement!: HrInsurancePolicyFactorDto;
}
export class HrInsurancePolicyFactorsDto {
  @IsIn(HR_INSURANCE_KINDS) insuranceKind!: typeof HR_INSURANCE_KINDS[number];
  @ValidateNested() @Type(() => HrInsurancePolicyComponentsDto) factors!: HrInsurancePolicyComponentsDto;
}
export class CreateHrInsurancePolicyVersionDto {
  @IsUUID() requestId!: string;
  @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u) policyCode!: string;
  @Transform(({ value }) => typeof value === "string" ? value.replace(/\p{Default_Ignorable_Code_Point}/gu, "").normalize("NFC").trim() : value)
  @IsString() @MinLength(1) @MaxLength(200) @Matches(/\p{L}/u) policyName!: string;
  @IsIn([1, 2]) variantNo!: number;
  @IsString() @Matches(/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u) effectiveFrom!: string;
  @IsString() @Matches(/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u) effectiveThrough!: string;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
  @IsOptional() @IsUUID() sourcePolicyId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) expectedSourceVersion?: number;
  @IsOptional() @IsArray() @ArrayMinSize(6) @ArrayMaxSize(6)
  @ValidateNested({ each: true }) @Type(() => HrInsurancePolicyFactorsDto)
  items?: HrInsurancePolicyFactorsDto[];
}
