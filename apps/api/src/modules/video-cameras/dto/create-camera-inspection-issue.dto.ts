import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "./transformers";

export class CreateCameraInspectionIssueDto {
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  hazard_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  risk_level?: string;

  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => trimOptional(value))
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => trimOptional(value))
  evidence_url?: string;
}
