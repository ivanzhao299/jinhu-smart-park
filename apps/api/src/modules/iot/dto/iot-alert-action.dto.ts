import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "./transformers";

export class IotAlertActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  reason?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  close_reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  ignore_reason?: string;
}
