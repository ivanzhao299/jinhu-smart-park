import { IsDateString, IsOptional, IsString, IsUUID } from "class-validator";

export class LeasingFunnelStatisticsQueryDto {
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsUUID()
  follow_user_id?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  industry_code?: string;
}
