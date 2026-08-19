import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from "class-validator";

export class MapAssetSpaceDto {
  @IsIn(["create", "link"])
  mode!: "create" | "link";

  @ValidateIf((dto: MapAssetSpaceDto) => dto.mode === "link")
  @IsUUID("4")
  businessId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ConvertAssetUnitDto {
  @IsIn([10, 20, 30, 40, 50, 60])
  usageType!: number;

  @IsIn([10, 20, 30, 40, 50, 60, 70])
  rentalStatus!: number;

  @IsIn([10, 20, 30])
  fittingStatus!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  useArea?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  refPrice?: number;

  @IsOptional()
  @IsDateString()
  availableDate?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  remark?: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
