import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { trimOptional } from "./transformers";

export class CaptureSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  source_type?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  source_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => trimOptional(value))
  description?: string;
}
