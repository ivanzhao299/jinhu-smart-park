import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, ArrayMinSize, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { HrPayrollInsuranceSourceDto } from "./hr-payroll-history.dto";
const uuid = () => Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value);
export class PayrollTrialOptionsDto {
  @IsOptional() @uuid() @IsUUID() legacyBatchId?: string;
  @IsOptional() @Matches(/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u) month?: string;
}
export class PayrollTrialMappingDto {
  @IsString() @MinLength(1) @MaxLength(96) modernCode!: string;
  @uuid() @IsUUID() sourceItemVersionId!: string;
}
export class PayrollTrialBookDto {
  @uuid() @IsUUID() bookId!: string;
  @uuid() @IsUUID() reconciliationSourceId!: string;
  @uuid() @IsUUID() inputId!: string;
  @IsInt() @Min(1) @Max(2147483647) expectedInputVersion!: number;
  @IsOptional() @uuid() @IsUUID() attendanceInputBatchId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000)
  @ValidateNested({ each: true }) @Type(() => HrPayrollInsuranceSourceDto) insuranceSources?: HrPayrollInsuranceSourceDto[];
  @IsArray() @ArrayMaxSize(256) @ValidateNested({ each: true }) @Type(() => PayrollTrialMappingDto) mappings!: PayrollTrialMappingDto[];
}
export class PayrollTrialDto {
  @uuid() @IsUUID() legacyBatchId!: string;
  @Matches(/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u) month!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PayrollTrialBookDto) books!: PayrollTrialBookDto[];
}
