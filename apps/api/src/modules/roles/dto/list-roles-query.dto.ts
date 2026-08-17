import { IsIn, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination-query.dto";

export class ListRolesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(["assignable", "unassignable", "template", "protected", "disabled"])
  assignability?: string;
}
