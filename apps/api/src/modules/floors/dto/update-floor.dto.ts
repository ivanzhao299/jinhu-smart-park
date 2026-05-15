import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from "class-validator";

export class UpdateFloorDto {
  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  @MaxLength(64)
  floorCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  floorNo?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  floorName?: string;

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
