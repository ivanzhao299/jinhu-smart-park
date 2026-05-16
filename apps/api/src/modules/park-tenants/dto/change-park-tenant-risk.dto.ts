import { Transform } from "class-transformer";
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

function trimString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(/[,，]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export class ChangeParkTenantRiskDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  risk_level!: string;

  @IsOptional()
  @Transform(({ value }) => normalizeTags(value))
  @IsArray()
  @IsString({ each: true })
  risk_tags?: string[];

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
