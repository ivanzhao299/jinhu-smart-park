import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export class CreateEmergencyWorkOrderDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  wo_type?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  priority!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  urgency!: string;

  @IsOptional()
  @IsUUID()
  assignee_id?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(1000)
  description!: string;
}
