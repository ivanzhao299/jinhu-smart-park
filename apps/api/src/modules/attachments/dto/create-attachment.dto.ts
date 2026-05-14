import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class CreateAttachmentDto {
  @IsString()
  @MaxLength(64)
  bizType!: string;

  @IsOptional()
  @IsUUID()
  bizId?: string;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  fileExt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @IsInt()
  @Min(0)
  @Max(5368709120)
  fileSize!: number;

  @IsString()
  @MaxLength(32)
  storageProvider!: string;

  @IsString()
  @MaxLength(500)
  storageKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sha256?: string;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
