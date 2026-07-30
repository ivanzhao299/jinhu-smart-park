import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class MultipartFileMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  original_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UploadFileDto extends MultipartFileMetadataDto {
  @IsString()
  @MaxLength(64)
  biz_type!: string;

  @IsOptional()
  @IsUUID()
  biz_id?: string;
}
