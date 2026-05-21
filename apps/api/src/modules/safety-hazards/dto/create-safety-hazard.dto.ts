import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function optionalArray(value: unknown): string[] | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

export class CreateSafetyHazardDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  hazard_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  source_type?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  source_id?: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  hazard_type!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  risk_level!: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  title!: string;

  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => trimOptional(value))
  description!: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  building_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  floor_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  unit_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  park_tenant_id?: string;

  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => trimOptional(value))
  location!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalArray(value))
  before_photo_file_ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalArray(value))
  after_photo_file_ids?: string[];

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  rectify_user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimOptional(value))
  rectify_user_name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  rectify_deadline?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  rectify_time?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  recheck_user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimOptional(value))
  recheck_user_name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  recheck_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  recheck_result?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => optionalBoolean(value))
  overdue_flag?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => optionalBoolean(value))
  upgrade_flag?: boolean;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  work_order_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
