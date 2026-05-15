import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsUUID } from "class-validator";

export class AssetStatisticsQueryDto {
  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsIn([10, 20, 30, 40, 50, 60])
  usage_type?: number;
}
