import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class CreateAssetUnitDto {
  @IsUUID()
  floorId!: string;

  @IsString()
  @MaxLength(64)
  unitCode!: string;

  @IsString()
  @MaxLength(100)
  unitName!: string;

  @IsString()
  @MaxLength(64)
  unitNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  usageType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buildingArea?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentableArea?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  orientation?: string;

  @IsOptional()
  @IsIn(["vacant", "reserved", "leased", "disabled"])
  leaseStatus?: string;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
