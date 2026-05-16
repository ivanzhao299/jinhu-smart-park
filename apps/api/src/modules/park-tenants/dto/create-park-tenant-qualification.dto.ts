import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function toStatus(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

export class CreateParkTenantQualificationDto {
  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  qualificationType!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  qualificationName!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  certificateNo?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsDateString()
  expireDate?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsUUID()
  fileId?: string;

  @IsOptional()
  @Transform(({ value }) => toStatus(value))
  @IsInt()
  @IsIn([0, 1])
  status?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
