import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination-query.dto";

export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  biz_type?: string;

  @IsOptional()
  @IsUUID()
  biz_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  start_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  end_time?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : value === "true" || value === true))
  @IsBoolean()
  success?: boolean;
}
