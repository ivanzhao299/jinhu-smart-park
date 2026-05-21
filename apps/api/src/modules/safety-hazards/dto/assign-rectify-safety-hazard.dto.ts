import { Transform } from "class-transformer";
import { IsString, IsUUID, MaxLength } from "class-validator";

function trimRequired(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export class AssignRectifySafetyHazardDto {
  @IsUUID()
  @Transform(({ value }) => trimRequired(value))
  rectify_user_id!: string;

  @IsString()
  @Transform(({ value }) => trimRequired(value))
  rectify_deadline!: string;

  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimRequired(value))
  reason!: string;
}
