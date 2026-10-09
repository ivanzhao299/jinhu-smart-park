import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from "class-validator";
import { HrPayrollFormalInputDetailQueryDto } from "./hr-payroll-formal-input.dto";
import { HrPayrollInsuranceSourceDto } from "./hr-payroll-history.dto";

export class CreateHrPayrollFormalRunDto {
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() inputId!: string;
  @IsInt() @Min(1) @Max(2147483647) expectedInputVersion!: number;
  @IsOptional() @IsUUID() attendanceInputBatchId?: string;
  @IsOptional() @IsUUID() correctionOfRunId?: string;
  @ValidateIf(o => o.correctionOfRunId !== undefined || o.correctionReason !== undefined)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(500) correctionReason?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000)
  @ValidateNested({ each: true }) @Type(() => HrPayrollInsuranceSourceDto) insuranceSources?: HrPayrollInsuranceSourceDto[];
}

export class TransitionHrPayrollFormalRunDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export class HrPayrollFormalRunQueryDto {
  @IsOptional() @Matches(/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u) month?: string;
  @IsOptional() @IsIn(["calculated", "reviewing", "confirmed", "cancelled"]) status?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class HrPayrollFormalRunOptionsQueryDto extends HrPayrollFormalInputDetailQueryDto {
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() inputId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) expectedInputVersion!: number;
}
