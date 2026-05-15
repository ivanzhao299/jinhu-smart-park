import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class UpdateAssetFloorDto {
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  floorCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  floorName?: string;

  @IsOptional()
  @IsInt()
  floorNo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  grossArea?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentableArea?: number;

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
