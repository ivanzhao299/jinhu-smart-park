import { IsDateString, IsOptional, IsString, IsUUID } from "class-validator";

export class WorkOrderStatsQueryDto {
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsString()
  wo_type?: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  assignee_id?: string;

  @IsOptional()
  @IsUUID()
  park_tenant_id?: string;
}
