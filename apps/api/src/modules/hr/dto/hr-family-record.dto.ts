import { Transform } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class HrFamilyRecordVersionDto {
  @IsInt() @Min(1) @Max(2147483646)
  expectedVersion!: number;
}

// Omitted fields preserve existing values. Only nullable fields accept explicit null.
export class UpdateHrFamilyRecordDto extends HrFamilyRecordVersionDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(32)
  relationship?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100)
  fullName?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @MaxLength(64)
  identityNumber?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @MaxLength(64)
  contact?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true, strictSeparator: true })
  birthDate?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @MaxLength(200)
  workUnit?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @MaxLength(160)
  jobTitle?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(trim) @IsString() @MaxLength(64)
  politicalStatus?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isEmergencyContact?: boolean;
}
