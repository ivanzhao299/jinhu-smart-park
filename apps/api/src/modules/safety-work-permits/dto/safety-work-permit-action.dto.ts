import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function normalizeOptionalFileIds(value: unknown): string[] | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeRequiredFileIds(value: unknown): string[] {
  return normalizeOptionalFileIds(value) ?? [];
}

export class SafetyWorkPermitActionDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  opinion?: string;
}

export class RejectSafetyWorkPermitDto extends SafetyWorkPermitActionDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reject_reason!: string;
}

export class SafetyWorkPermitPhotoActionDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(1000)
  content?: string;

  @Transform(({ value }) => normalizeRequiredFileIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  photo_file_ids!: string[];
}

export class SafetyWorkPermitProcessCheckDto {
  @IsIn(["pass", "fail", "violation"])
  result!: "pass" | "fail" | "violation";

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(1000)
  content?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalFileIds(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  photo_file_ids?: string[];
}

export class SafetyWorkPermitStopDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalFileIds(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  photo_file_ids?: string[];
}

export class SafetyWorkPermitCloseDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(1000)
  content?: string;
}

export class CreateWorkPermitCheckHazardDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  hazard_type?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  risk_level?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  rectify_user_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  rectify_deadline?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class CreateWorkPermitCheckWorkOrderDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  wo_type?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  priority?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  urgency?: string;

  @IsOptional()
  @IsUUID()
  assignee_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(1000)
  description?: string;
}
