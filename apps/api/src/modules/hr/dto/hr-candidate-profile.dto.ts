import { Transform } from "class-transformer";
import { IsDateString, IsEmail, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const nullableTrim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() || null : value;
const provided = (_: unknown, value: unknown) => value !== undefined;
const nullableProvided = (_: unknown, value: unknown) => value !== undefined && value !== null;
const pageNumber = ({ value }: { value: unknown }) => typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value;

export class HrCandidateProfileListDto {
  @Transform(pageNumber) @IsInt() @Min(1) page = 1;
  @Transform(pageNumber) @IsInt() @Min(1) @Max(100) page_size = 20;
  @ValidateIf(provided) @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
}

export class SaveHrCandidateProfileDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @Transform(trim) @IsString() @Matches(/\S/u) @MaxLength(1000) changeReason!: string;
  @ValidateIf(provided) @Transform(trim) @IsString() @Matches(/\S/u) @MaxLength(64) candidateNo?: string;
  @ValidateIf(provided) @Transform(trim) @IsString() @Matches(/\S/u) @MaxLength(100) fullName?: string;
  @ValidateIf(provided) @IsUUID() requisitionId?: string;
  @ValidateIf(nullableProvided) @Transform(nullableTrim) @IsString() @MaxLength(64) source?: string | null;
  @ValidateIf(nullableProvided) @IsString() @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/u) @IsDateString({ strict: true }) expectedOnboardDate?: string | null;
  @ValidateIf(nullableProvided) @Transform(nullableTrim) @Matches(/^\+?[0-9 -]{6,24}$/u) mobile?: string | null;
  @ValidateIf(nullableProvided) @Transform(nullableTrim) @IsEmail() @MaxLength(160) email?: string | null;
  @ValidateIf(nullableProvided) @Transform(nullableTrim) @IsString() @MaxLength(64) identityNumber?: string | null;
}
