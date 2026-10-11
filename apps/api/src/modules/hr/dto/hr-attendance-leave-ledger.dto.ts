import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const name = ({ value }: { value: unknown }) => typeof value === "string" ? value.replace(/\p{Default_Ignorable_Code_Point}/gu, "").trim() : value;
export class HrLeaveLedgerPageDto {
 @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
 @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
}
export class HrLeaveQuotaListDto extends HrLeaveLedgerPageDto {
 @ValidateIf((_o, v) => v !== undefined) @IsUUID() employee_id?: string;
}
export class HrLeaveBalanceEmployeeQueryDto extends HrLeaveLedgerPageDto {
 @ValidateIf((_o, v) => v !== undefined) @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
}
export class HrLeaveBalanceQueryDto extends HrLeaveLedgerPageDto {
 @ValidateIf((_o, v) => v !== undefined) @IsUUID() employee_id?: string;
 @IsDateString({ strict: true }) @Matches(/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/u) from!: string;
 @IsDateString({ strict: true }) @Matches(/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/u) to!: string;
}
export class HrLeaveTypeCodeDto {
 @Matches(/^[A-Z][A-Z0-9_]{0,31}$/u) code!: string;
}
export class PutHrLeaveTypeDto {
 @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
 @Transform(name) @IsString() @MaxLength(100) @Matches(/\p{L}/u) typeName!: string;
 @IsBoolean() enabled!: boolean;
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export class PutHrLeaveQuotaDto {
 @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
 @IsInt() @Min(0) @Max(2147483647) openingMinutes!: number;
 @IsInt() @Min(-2147483647) @Max(2147483647) adjustmentMinutes!: number;
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export class CreateHrLeaveQuotaDto {
 @IsUUID() employeeId!: string;
 @IsUUID() leaveTypeId!: string;
 @IsDateString({ strict: true }) @Matches(/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/u) periodStart!: string;
 @IsDateString({ strict: true }) @Matches(/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/u) periodEnd!: string;
 @IsInt() @Min(0) @Max(2147483647) openingMinutes!: number;
 @IsInt() @Min(-2147483647) @Max(2147483647) adjustmentMinutes!: number;
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
