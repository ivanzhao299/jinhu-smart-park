import { IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateIf } from "class-validator";

const USAGE_TYPES = [10, 20, 30, 40, 50, 60] as const;
const RENTAL_STATUSES = [10, 20, 30, 40, 50, 60, 70] as const;
const FITTING_STATUSES = [10, 20, 30] as const;

export class CreateUnitDto {
  @IsString()
  @ValidateIf((_dto, value) => value !== undefined && value !== "")
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  @MaxLength(64)
  unitCode?: string;

  @IsUUID()
  buildingId!: string;

  @IsUUID()
  floorId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  unitName!: string;

  @IsIn(USAGE_TYPES)
  usageType!: number;

  @IsNumber()
  @Min(0)
  unitArea!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  useArea?: number;

  @IsIn(RENTAL_STATUSES)
  rentalStatus!: number;

  @IsIn(FITTING_STATUSES)
  fittingStatus!: number;

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
