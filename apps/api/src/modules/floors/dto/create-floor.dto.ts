import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateIf } from "class-validator";

export class CreateFloorDto {
  @IsUUID()
  buildingId!: string;

  @IsString()
  @ValidateIf((_dto, value) => value !== undefined && value !== "")
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  @MaxLength(64)
  floorCode?: string;

  @IsInt()
  @Min(0)
  floorNo!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  floorName!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  floorArea?: number;

  @IsOptional()
  @IsUUID()
  layoutFileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  layoutUrl?: string;

  @IsOptional()
  @IsIn([0, 1])
  status?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortNo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
