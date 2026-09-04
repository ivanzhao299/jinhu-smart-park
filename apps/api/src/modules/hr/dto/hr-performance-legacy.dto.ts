import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

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
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,10}$/)
  source_person_code!: string;
}

export class HrPerformanceLegacyRubricQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  source_assessment_id!: number;
}
