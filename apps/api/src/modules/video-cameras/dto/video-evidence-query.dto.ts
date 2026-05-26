import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { optionalInteger, trimOptional } from "./transformers";

export class VideoEvidenceQueryDto {
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  camera_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  source_type?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  source_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  evidence_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  sort?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => optionalInteger(value))
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Transform(({ value }) => optionalInteger(value))
  page_size?: number;
}
