import { IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination-query.dto";

export class AssetQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  asset_park_id?: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;
}
