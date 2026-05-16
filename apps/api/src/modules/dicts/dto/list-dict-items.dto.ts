import { IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination-query.dto";

export class ListDictItemsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  dict_type_id?: string;
}
