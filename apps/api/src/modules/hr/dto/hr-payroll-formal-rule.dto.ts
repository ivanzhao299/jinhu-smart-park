import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from "class-validator";
import { FORMAL_PAYROLL_ROLES, type FormalPayrollRole } from "../hr-payroll-formal-calculation";
import { FORMAL_PAYROLL_COMPENSATION_POLICIES, type FormalPayrollCompensationPolicy } from "@jinhu/shared";

export class CreateHrPayrollRuleSetDto {
  @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u) ruleCode!: string;
  @Transform(({ value }) => typeof value === "string" ? value.replace(/\p{Default_Ignorable_Code_Point}/gu, "").normalize("NFC").trim() : value)
  @IsString() @MinLength(1) @MaxLength(200) @Matches(/\p{L}/u) displayName!: string;
  @IsOptional() @IsUUID() sourceBookId?: string;
}

export class HrPayrollFormalItemDto {
  @IsString() @Matches(/^[\p{L}\p{N}_ -]{1,96}$/u) code!: string;
  @IsIn(FORMAL_PAYROLL_ROLES) role!: FormalPayrollRole;
  @ValidateIf((_object, value) => value !== null)
  @IsString() @MinLength(1) @MaxLength(2000) expression!: string | null;
}

export class HrPayrollFormalDefinitionDto {
  @IsIn(["line_items_half_up"]) roundingPolicy!: "line_items_half_up";
  @IsOptional() @IsIn(FORMAL_PAYROLL_COMPENSATION_POLICIES) compensationPolicy?: FormalPayrollCompensationPolicy;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(256)
  @ValidateNested({ each: true }) @Type(() => HrPayrollFormalItemDto) items!: HrPayrollFormalItemDto[];
}

export class CreateHrPayrollRuleVersionDto {
  @IsInt() @Min(0) @Max(2147483646) expectedHeadRevision!: number;
  @IsDefined() @ValidateNested() @Type(() => HrPayrollFormalDefinitionDto) definition!: HrPayrollFormalDefinitionDto;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

export class UpdateHrPayrollRuleVersionDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @IsDefined() @ValidateNested() @Type(() => HrPayrollFormalDefinitionDto) definition!: HrPayrollFormalDefinitionDto;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

export class SubmitHrPayrollRuleVersionDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
}

export class ReviewHrPayrollRuleVersionDto extends SubmitHrPayrollRuleVersionDto {
  @IsIn(["approve", "reject"]) decision!: "approve" | "reject";
  @IsOptional() @IsString() @Matches(/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u) effectiveFrom?: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

export class HrPayrollFormalRuleQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class HrPayrollEffectiveRuleQueryDto {
  @IsString() @Matches(/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u) month!: string;
}

export class HrPayrollBookOptionsQueryDto extends HrPayrollFormalRuleQueryDto {
  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MaxLength(100) keyword?: string;
}
