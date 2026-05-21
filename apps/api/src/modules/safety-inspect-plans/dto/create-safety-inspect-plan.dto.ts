import { Transform } from "class-transformer";
import { IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export class CreateSafetyInspectPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  plan_code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  plan_name!: string;

  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  template_id!: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => stringArray(value) ?? [])
  point_ids!: string[];

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  frequency_type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => trimOptional(value))
  cron_expr?: string;

  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  start_date!: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  end_date?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => stringArray(value) ?? [])
  handler_user_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => stringArray(value) ?? [])
  handler_role_codes?: string[];

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
