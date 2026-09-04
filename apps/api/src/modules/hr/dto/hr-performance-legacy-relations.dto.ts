import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";
import { HrPerformanceLegacyPageQueryDto } from "./hr-performance-legacy.dto";

export class HrPerformanceLegacyRelationQueryDto extends HrPerformanceLegacyPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  source_session_id?: number;
}
