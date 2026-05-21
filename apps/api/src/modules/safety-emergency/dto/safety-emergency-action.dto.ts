import { Transform } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { optionalNumber, optionalStringArray, trimOptional } from "./transformers";

export class SafetyEmergencyActionDto {
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
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  attachment_file_ids?: string[];
}

export class SafetyEmergencyReviewDto {
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  conclusion!: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  review_file_id?: string;
}

export class CreateSafetyEmergencyTimelineDto {
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  reason?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  attachment_file_ids?: string[];

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lng?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lat?: number;
}
