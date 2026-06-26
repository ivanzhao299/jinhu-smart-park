import { Transform } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { EngineeringPlanLevel, EngineeringPlanStatus, EngineeringPlanType, EngineeringRiskLevel } from "../domain/engineering-project.enums";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

function optionalInteger(value: unknown): number | undefined {
  const numberValue = optionalNumber(value);
  return numberValue === undefined ? undefined : Math.trunc(numberValue);
}

export class CreateEngineeringPlanDto {
  @IsUUID()
  project_id!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  plan_name!: string;

  @IsEnum(EngineeringPlanType)
  plan_type!: EngineeringPlanType;

  @IsOptional()
  @IsUUID()
  parent_plan_id?: string;

  @IsOptional()
  @IsEnum(EngineeringPlanLevel)
  plan_level?: EngineeringPlanLevel;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  planned_start_date?: string;

  @IsOptional()
  @IsDateString()
  planned_end_date?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100)
  planned_progress_percent?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsUUID()
  owner_user_id?: string;

  @IsOptional()
  @IsUUID()
  owner_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsEnum(EngineeringRiskLevel)
  risk_level?: EngineeringRiskLevel;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];
}

export class UpdateEngineeringPlanDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  plan_name?: string;

  @IsOptional()
  @IsEnum(EngineeringPlanType)
  plan_type?: EngineeringPlanType;

  @IsOptional()
  @IsUUID()
  parent_plan_id?: string;

  @IsOptional()
  @IsEnum(EngineeringPlanLevel)
  plan_level?: EngineeringPlanLevel;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  planned_start_date?: string;

  @IsOptional()
  @IsDateString()
  planned_end_date?: string;

  @IsOptional()
  @IsDateString()
  actual_start_date?: string;

  @IsOptional()
  @IsDateString()
  actual_end_date?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100)
  planned_progress_percent?: number;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100)
  actual_progress_percent?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsUUID()
  owner_user_id?: string;

  @IsOptional()
  @IsUUID()
  owner_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsEnum(EngineeringRiskLevel)
  risk_level?: EngineeringRiskLevel;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];
}

export class UpdateEngineeringPlanProgressDto {
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100)
  actual_progress_percent!: number;

  @IsOptional()
  @IsDateString()
  actual_start_date?: string;

  @IsOptional()
  @IsDateString()
  actual_end_date?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class UpdateEngineeringPlanStatusDto {
  @IsEnum(EngineeringPlanStatus)
  status!: EngineeringPlanStatus;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  comment?: string;
}

export class EngineeringPlanQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value, obj }) => Number(value ?? (obj as { pageSize?: unknown }).pageSize ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(EngineeringPlanType)
  plan_type?: EngineeringPlanType;

  @IsOptional()
  @IsEnum(EngineeringPlanStatus)
  status?: EngineeringPlanStatus;

  @IsOptional()
  @IsEnum(EngineeringPlanLevel)
  plan_level?: EngineeringPlanLevel;

  @IsOptional()
  @IsUUID()
  owner_user_id?: string;

  @IsOptional()
  @IsUUID()
  owner_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsDateString()
  planned_start_from?: string;

  @IsOptional()
  @IsDateString()
  planned_start_to?: string;
}
