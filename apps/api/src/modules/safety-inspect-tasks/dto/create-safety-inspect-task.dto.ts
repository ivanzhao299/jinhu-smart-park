import { Transform } from "class-transformer";
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export class CreateSafetyInspectTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  task_code?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  plan_id?: string;

  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  template_id!: string;

  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  point_id!: string;

  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  handler_id!: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  plan_time?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  due_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
