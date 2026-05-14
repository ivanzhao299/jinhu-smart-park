import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination-query.dto";

export class FileQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  biz_type?: string;

  @IsOptional()
  @IsUUID()
  biz_id?: string;
}
