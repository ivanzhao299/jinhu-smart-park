import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { optionalInteger, trimOptional } from "./create-work-order.dto";

export class WorkOrderSlaRuleQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  wo_type?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  urgency?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  priority?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  status?: string;
}

export class CreateWorkOrderSlaRuleDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  wo_type!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  urgency!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  priority!: string;

  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100000)
  dispatch_sla_min!: number;

  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100000)
  finish_sla_min!: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  escalate_role_code?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateWorkOrderSlaRuleDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  wo_type?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  urgency?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  priority?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100000)
  dispatch_sla_min?: number;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100000)
  finish_sla_min?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  escalate_role_code?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
