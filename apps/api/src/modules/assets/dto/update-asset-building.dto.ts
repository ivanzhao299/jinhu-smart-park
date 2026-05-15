import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class UpdateAssetBuildingDto {
  @IsOptional()
  @IsUUID()
  assetParkId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  buildingCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  buildingName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  floorCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalArea?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
