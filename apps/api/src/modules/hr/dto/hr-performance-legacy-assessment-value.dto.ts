import {
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PREFIX_PATTERN,
  HR_PERFORMANCE_LEGACY_QUERY_TEXT_PATTERN,
  HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
  normalizeHrPerformanceLegacyQueryText,
} from "@jinhu/shared";
import { Transform } from "class-transformer";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { HrPerformanceLegacyPageQueryDto } from "./hr-performance-legacy.dto";

export class HrPerformanceLegacyAssessmentValueQueryDto
  extends HrPerformanceLegacyPageQueryDto {
  @Transform(({ value }: { value: unknown }) => normalizeHrPerformanceLegacyQueryText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH)
  @Matches(HR_PERFORMANCE_LEGACY_QUERY_TEXT_PATTERN)
  ass_session!: string;

  @Transform(({ value }: { value: unknown }) => normalizeHrPerformanceLegacyQueryText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH)
  @Matches(HR_PERFORMANCE_LEGACY_DEPARTMENT_PREFIX_PATTERN)
  department_prefix!: string;
}
