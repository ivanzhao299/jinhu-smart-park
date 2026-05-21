import { Transform } from "class-transformer";
import { IsArray, IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { optionalInteger, optionalStringArray, trimOptional } from "./transformers";

export class CreateSafetyEmergencyContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  contact_code?: string;

  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimOptional(value))
  contact_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  contact_role?: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  mobile!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  @Transform(({ value }) => trimOptional(value))
  email?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  org_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  duty_type?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  @Transform(({ value }) => optionalInteger(value))
  priority_level?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  notify_channels?: string[];

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
