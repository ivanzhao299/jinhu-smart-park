import { Transform } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export const WORK_ORDER_SOURCE_TYPES = ["manual", "tenant_request", "alert", "inspection", "robot", "system"] as const;

export function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : Number.NaN;
}

export function normalizeStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : undefined;
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return undefined;
}

export class CreateWorkOrderDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  wo_code?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  title!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  wo_type!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  wo_sub_type?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  priority!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  urgency?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(WORK_ORDER_SOURCE_TYPES)
  source_type?: (typeof WORK_ORDER_SOURCE_TYPES)[number];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  source_id?: string;

  @IsOptional()
  @IsUUID()
  park_tenant_id?: string;

  @IsOptional()
  @IsUUID()
  unit_id?: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  room_label?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsUUID()
  reporter_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  reporter_name?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  reporter_mobile?: string;

  @IsOptional()
  @IsUUID()
  assignee_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  assignee_name?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description!: string;

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @IsUUID("4", { each: true })
  image_file_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @IsUUID("4", { each: true })
  video_file_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  device_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  robot_id?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100000)
  sla_dispatch_min?: number;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100000)
  sla_finish_min?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
