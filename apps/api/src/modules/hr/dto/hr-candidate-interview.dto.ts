import { Transform } from "class-transformer";
import { IsDateString, IsDefined, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const pageNumber = ({ value }: { value: unknown }) => value === undefined ? 1 : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value;
const isoSecondWithOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/u;

export class HrCandidateInterviewListDto {
  @Transform(pageNumber) @IsInt() @Min(1) page = 1;
  @Transform(pageNumber) @IsInt() @Min(1) @Max(100) page_size = 20;
}

export class SaveHrCandidateInterviewDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsDefined() @Transform(trim) @IsString() @Matches(/\S/u) @MaxLength(120) roundLabel!: string;
  @IsDefined() @IsString() @IsDateString({ strict: true }) @Matches(isoSecondWithOffset) startsAt!: string;
  @IsDefined() @IsString() @IsDateString({ strict: true }) @Matches(isoSecondWithOffset) endsAt!: string;
  @IsDefined() @Transform(trim) @IsString() @Matches(/\S/u) @MaxLength(240) location!: string;
  @IsDefined() @Transform(trim) @IsString() @Matches(/\S/u) @MaxLength(100) interviewerName!: string;
  @IsDefined() @IsIn(["scheduled", "completed", "cancelled"]) status!: "scheduled" | "completed" | "cancelled";
  @IsDefined() @IsIn(["pending", "pass", "fail", "hold"]) outcome!: "pending" | "pass" | "fail" | "hold";
  @IsDefined() @ValidateIf((_, value) => value !== null) @Transform(trim) @IsString() @MaxLength(2000) resultNotes!: string | null;
  @IsDefined() @ValidateIf((_, value) => value !== null) @Transform(trim) @IsString() @MaxLength(1000) cancellationReason!: string | null;
}
