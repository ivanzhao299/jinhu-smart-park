import { Transform } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

export class UpdateLeasingVisitDto {
  @IsOptional()
  @IsDateString()
  visitTime?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  visitorCount?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsUUID()
  receptionUserId?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  receptionUserName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  unitIds?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(2000)
  visitResult?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  photoFileIds?: string[];

  @IsOptional()
  @Transform(({ value }) => optionalBoolean(value))
  @IsBoolean()
  advanceStatus?: boolean;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
