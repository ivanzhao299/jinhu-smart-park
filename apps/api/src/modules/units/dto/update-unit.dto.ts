import { IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from "class-validator";

const USAGE_TYPES = [10, 20, 30, 40, 50, 60] as const;
const RENTAL_STATUSES = [10, 20, 30, 40, 50, 60, 70] as const;
const FITTING_STATUSES = [10, 20, 30] as const;

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  @MaxLength(64)
  unitCode?: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  unitName?: string;

  @IsOptional()
  @IsIn(USAGE_TYPES)
  usageType?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitArea?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  useArea?: number;

  @IsOptional()
  @IsIn(RENTAL_STATUSES)
  rentalStatus?: number;

  @IsOptional()
  @IsIn(FITTING_STATUSES)
  fittingStatus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  refPrice?: number;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  photoFileIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsUUID()
  floorplanFileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  floorplanUrl?: string;

  @IsOptional()
  @IsDateString()
  availableDate?: string;

  @IsOptional()
  @IsIn([0, 1])
  status?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
