import { Transform } from "class-transformer";
import { IsArray, IsOptional, IsString, MaxLength } from "class-validator";
import { optionalJson, optionalStringArray, trimOptional } from "./transformers";

export class CreateSafetyEmergencyPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  plan_code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  plan_name!: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  incident_type!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  severity_level!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  response_level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  commander_role?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  response_team_role_codes?: string[];

  @IsOptional()
  @Transform(({ value }) => optionalJson(value))
  steps_json?: unknown;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  attachment_file_ids?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
