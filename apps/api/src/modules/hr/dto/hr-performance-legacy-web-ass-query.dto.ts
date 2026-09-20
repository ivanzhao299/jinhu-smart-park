import {
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN,
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PREFIX_PATTERN,
  HR_PERFORMANCE_LEGACY_QUERY_TEXT_PATTERN,
  HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
  normalizeHrPerformanceLegacyQueryText,
} from "@jinhu/shared";
import { Transform } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { HrPerformanceLegacyPageQueryDto } from "./hr-performance-legacy.dto";

const normalizeOptionalLegacyPattern = (value: unknown): string | undefined => {
  const normalized = normalizeHrPerformanceLegacyQueryText(value);
  return normalized || undefined;
};

const normalizeLegacyFiniteNumber = (value: unknown): number =>
  typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);

export class HrPerformanceLegacyWebAssQueryDto
  extends HrPerformanceLegacyPageQueryDto {
  @Transform(({ value }: { value: unknown }) => normalizeHrPerformanceLegacyQueryText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH)
  @Matches(HR_PERFORMANCE_LEGACY_QUERY_TEXT_PATTERN)
  ass_session!: string;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalLegacyPattern(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH)
  @Matches(HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN)
  person_like?: string;

  @Transform(({ value }: { value: unknown }) => normalizeHrPerformanceLegacyQueryText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH)
  @Matches(HR_PERFORMANCE_LEGACY_DEPARTMENT_PREFIX_PATTERN)
  right_scope_prefix!: string;

  @Transform(({ value }: { value: unknown }) => normalizeLegacyFiniteNumber(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  item_value_min!: number;

  @Transform(({ value }: { value: unknown }) => normalizeLegacyFiniteNumber(value))
  @IsNumber({ allowInfinity: false, allowNaN: false })
  item_value_max!: number;
}
