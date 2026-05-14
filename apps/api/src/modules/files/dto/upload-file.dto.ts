import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class UploadFileDto {
  @IsString()
  @MaxLength(64)
  biz_type!: string;

  @IsOptional()
  @IsUUID()
  biz_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
