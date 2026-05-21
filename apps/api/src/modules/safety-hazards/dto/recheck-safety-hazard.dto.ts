import { Transform } from "class-transformer";
import { IsIn, IsString, MaxLength } from "class-validator";

function trimRequired(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export class RecheckSafetyHazardDto {
  @IsString()
  @IsIn(["pass", "fail"])
  @Transform(({ value }) => trimRequired(value))
  recheck_result!: "pass" | "fail";

  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimRequired(value))
  reason!: string;
}
