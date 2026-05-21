import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

export class CheckInSafetyInspectTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  qr_code?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lng?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lat?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  @Transform(({ value }) => stringArray(value))
  photo_file_ids?: string[];
}
