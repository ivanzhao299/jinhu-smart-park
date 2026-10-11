import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { HR_LEAVE_CANCELLATION_COMMANDS, HR_LEAVE_CANCELLATION_STATUSES } from "@jinhu/shared";
import type { HrLeaveCancellationCommand, HrLeaveCancellationStatus } from "@jinhu/shared";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const minuteInstant = /^(?:19|20|21)\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/u;

class CancellationTimingDto {
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(minuteInstant) startAt!: string;
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(minuteInstant) endAt!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!: string;
}
export class CreateHrLeaveCancellationDto extends CancellationTimingDto {
  @IsUUID() sourceRequestId!: string;
  @IsInt() @Min(1) expectedSourceVersion!: number;
}
export class UpdateHrLeaveCancellationDto extends CancellationTimingDto {
  @IsInt() @Min(1) expectedVersion!: number;
}
export class HrLeaveCancellationActionDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(HR_LEAVE_CANCELLATION_COMMANDS) action!: HrLeaveCancellationCommand;
  @ValidateIf((_object, value) => value !== undefined) @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) comment?: string;
}
export class HrLeaveCancellationPageDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
}
export class HrLeaveCancellationListDto extends HrLeaveCancellationPageDto {
  @ValidateIf((_object, value) => value !== undefined) @IsIn(HR_LEAVE_CANCELLATION_STATUSES) status?: HrLeaveCancellationStatus;
  @ValidateIf((_object, value) => value !== undefined) @IsUUID() employee_id?: string;
}
export class HrLeaveCancellationSourceQueryDto extends HrLeaveCancellationPageDto {
  @ValidateIf((_object, value) => value !== undefined) @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsUUID() employee_id?: string;
}
