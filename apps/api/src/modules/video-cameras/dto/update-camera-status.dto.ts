import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { optionalBoolean, trimOptional } from "./transformers";

export class UpdateCameraStatusDto {
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  status!: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => optionalBoolean(value))
  is_enabled?: boolean;
}
