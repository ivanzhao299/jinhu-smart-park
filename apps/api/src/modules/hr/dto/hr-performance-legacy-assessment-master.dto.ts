import {
  HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES,
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN,
  HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_QUERY_TEXT_PATTERN,
  HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
  normalizeHrPerformanceLegacyQueryText,
  type HrPerformanceLegacyDepartmentMatchMode,
} from "@jinhu/shared";
import { Transform } from "class-transformer";
import { IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { HrPerformanceLegacyPageQueryDto } from "./hr-performance-legacy.dto";

export class HrPerformanceLegacyAssessmentMasterQueryDto
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
  @MaxLength(HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH)
  @Matches(HR_PERFORMANCE_LEGACY_QUERY_TEXT_PATTERN)
  assessment_type!: string;

  @Transform(({ value }: { value: unknown }) => normalizeHrPerformanceLegacyQueryText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH)
  @Matches(HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN)
  department_like!: string;

  @IsIn(HR_PERFORMANCE_LEGACY_DEPARTMENT_MATCH_MODES)
  department_match_mode!: HrPerformanceLegacyDepartmentMatchMode;
}
