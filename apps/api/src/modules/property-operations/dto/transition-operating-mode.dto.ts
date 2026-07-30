import { Transform } from "class-transformer";
import { IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { PROPERTY_OPERATING_MODES, type PropertyOperatingMode } from "@jinhu/shared";

export class TransitionOperatingModeDto {
  @IsIn(PROPERTY_OPERATING_MODES)
  target_mode!: PropertyOperatingMode;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
