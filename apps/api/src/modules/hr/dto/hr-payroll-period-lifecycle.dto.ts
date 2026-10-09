import { Transform } from "class-transformer";
import { IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class CloseHrPayrollPeriodDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export class OpenHrPayrollCorrectionWindowDto extends CloseHrPayrollPeriodDto {
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value)
  @IsUUID() originalRunId!: string;
  @IsInt() @Min(1) @Max(2147483646) expectedRunVersion!: number;
}
export class CompleteHrPayrollCorrectionWindowDto extends CloseHrPayrollPeriodDto {
  @Transform(({ value }) => typeof value === "string" ? value.toLowerCase() : value)
  @IsUUID() completedRunId!: string;
}
