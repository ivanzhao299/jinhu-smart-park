import { Transform } from "class-transformer";
import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export class CreateLeasingFollowDto {
  @IsOptional()
  @IsDateString()
  followTime?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  followType?: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  nextAction?: string;

  @IsOptional()
  @IsDateString()
  nextFollowTime?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  attachmentFileIds?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
