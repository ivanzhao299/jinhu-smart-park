import { Transform } from "class-transformer";
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { trimOptional } from "./transformers";

export class CreateVideoEvidenceDto {
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  camera_id!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  source_type!: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  source_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  evidence_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  evidence_url?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  snapshot_url?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  clip_start_time?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  clip_end_time?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  captured_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => trimOptional(value))
  description?: string;
}
