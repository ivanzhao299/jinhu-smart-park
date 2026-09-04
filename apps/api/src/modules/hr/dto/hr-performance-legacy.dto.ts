import {
  HR_LEGACY_PERSON_CODE_PATTERN,
  normalizeHrLegacyPersonCode,
} from "@jinhu/shared";
import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class HrPerformanceLegacyPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  page_size = 50;
}

export class HrPerformanceLegacyResultQueryDto extends HrPerformanceLegacyPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  source_session_id?: number;
}

export class HrPerformanceLegacyPersonSummaryQueryDto extends HrPerformanceLegacyPageQueryDto {
  @Transform(({ value }: { value: unknown }) => normalizeHrLegacyPersonCode(value))
  @IsString()
  @Matches(HR_LEGACY_PERSON_CODE_PATTERN)
  source_person_code!: string;
}

export class HrPerformanceLegacyRubricQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  source_assessment_id!: number;
}
