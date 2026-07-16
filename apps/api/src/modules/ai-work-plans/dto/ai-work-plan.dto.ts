import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf
} from "class-validator";

function trim(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}
export class CreateAiWorkPlanDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  instruction!: string;

  @IsOptional()
  @IsISO8601()
  default_due_at?: string;

  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsUUID()
  target_org_id?: string;
}

export class UpdateAiWorkPlanTaskDto {
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  confirmed_assignee_id?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  department_id?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsISO8601()
  due_at?: string | null;

  @IsOptional()
  @IsIn(["low", "medium", "high"])
  priority?: "low" | "medium" | "high";

  @IsOptional()
  @IsIn(["low", "normal", "urgent", "critical"])
  urgency?: "low" | "normal" | "urgent" | "critical";

  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(2000)
  acceptance_criteria?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10080)
  planned_effort_minutes?: number;
}

export class ReviewAiWorkPlanDto {
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RejectAiWorkPlanDto {
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;
}

export class AiWorkPlanQueryDto {
  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) => trim(value))
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}

export class MaterializeAiWorkPlanDto {
  @IsOptional()
  @IsBoolean()
  confirm = true;
}
