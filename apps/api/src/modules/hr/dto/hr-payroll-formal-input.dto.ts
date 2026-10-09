import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsDefined, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

export class HrPayrollFormalEmployeeInputDto {
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() employeeId!: string;
  @IsInt() @Min(1) @Max(2147483647) expectedEmployeeVersion!: number;
  @IsDefined() @IsObject() directItems!: Record<string, string>;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) eligibilityReason?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/u) @IsDateString({ strict: true }) settlementStart?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/u) @IsDateString({ strict: true }) settlementEnd?: string;
}
export class HrPayrollFormalInputPayloadDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000)
  @ValidateNested({ each: true }) @Type(() => HrPayrollFormalEmployeeInputDto) employees!: HrPayrollFormalEmployeeInputDto[];
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
export class CreateHrPayrollFormalInputDto extends HrPayrollFormalInputPayloadDto {
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() correctionWindowId?: string;
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() periodId!: string;
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() ruleSetId!: string;
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() ruleVersionId!: string;
  @IsInt() @Min(0) @Max(2147483646) expectedHeadRevision!: number;
}
export class UpdateHrPayrollFormalInputDto extends HrPayrollFormalInputPayloadDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
}
export class ConfirmHrPayrollFormalInputDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
}
export class HrPayrollFormalInputQueryDto {
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() correctionWindowId?: string;
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() periodId!: string;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() ruleSetId?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class HrPayrollFormalInputDetailQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class HrPayrollFormalPreparationQueryDto extends HrPayrollFormalInputDetailQueryDto {
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() correctionWindowId?: string;
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() periodId!: string;
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value) @IsUUID() ruleSetId!: string;
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MaxLength(100) keyword?: string;
}
