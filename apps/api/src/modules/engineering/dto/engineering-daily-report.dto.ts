import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { EngineeringDailyReportStatus, EngineeringWeatherType } from "../domain/engineering-project.enums";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : Number.NaN;
}

export class CreateEngineeringDailyReportDto {
  @IsUUID()
  project_id!: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsDateString()
  report_date!: string;

  @IsEnum(EngineeringWeatherType)
  weather!: EngineeringWeatherType;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  temperature?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  work_content!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  completed_work?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  unfinished_work?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  tomorrow_plan?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  worker_count?: number;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  manager_count?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  machine_summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  material_summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  quality_summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  safety_summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  issue_summary?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100)
  progress_percent?: number;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateEngineeringDailyReportDto {
  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @IsEnum(EngineeringWeatherType)
  weather?: EngineeringWeatherType;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  temperature?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  work_content?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  completed_work?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  unfinished_work?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  tomorrow_plan?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  worker_count?: number;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  manager_count?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  machine_summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  material_summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  quality_summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  safety_summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  issue_summary?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100)
  progress_percent?: number;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class ReviewEngineeringDailyReportDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  review_comment?: string;
}

export class EngineeringDailyReportQueryDto {
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
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(EngineeringDailyReportStatus)
  report_status?: EngineeringDailyReportStatus;

  @IsOptional()
  @IsEnum(EngineeringWeatherType)
  weather?: EngineeringWeatherType;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @IsDateString()
  report_date_from?: string;

  @IsOptional()
  @IsDateString()
  report_date_to?: string;
}
