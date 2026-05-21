import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  return Number.parseInt(String(value), 10);
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export class CreateSafetyInspectItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  item_code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  item_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  item_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  hazard_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  default_risk_level?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => optionalBoolean(value))
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => optionalInteger(value))
  sort_no?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => trimOptional(value))
  standard_desc?: string;

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
