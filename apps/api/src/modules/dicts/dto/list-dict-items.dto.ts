import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination-query.dto";

export class ListDictItemsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  dict_type_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  dict_code?: string;
}
