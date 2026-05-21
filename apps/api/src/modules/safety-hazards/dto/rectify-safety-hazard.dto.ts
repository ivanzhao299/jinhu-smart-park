import { Transform } from "class-transformer";
import { ArrayMinSize, ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength } from "class-validator";

function trimRequired(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function requiredArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

export class RectifySafetyHazardDto {
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => trimRequired(value))
  rectify_note!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => requiredArray(value))
  after_photo_file_ids!: string[];
}
