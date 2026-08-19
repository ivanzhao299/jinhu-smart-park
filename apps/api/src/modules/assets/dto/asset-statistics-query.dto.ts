import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import { UNIT_USAGE_TYPES } from "@jinhu/shared";

export class AssetStatisticsQueryDto {
  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsIn(UNIT_USAGE_TYPES)
  usage_type?: number;
}
