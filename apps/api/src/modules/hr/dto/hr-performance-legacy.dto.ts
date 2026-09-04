import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

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

export class HrPerformanceLegacyRubricQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  source_assessment_id!: number;
}
