import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from "class-validator";

export class CreateBuildingDto {
  @IsString()
  @ValidateIf((_dto, value) => value !== undefined && value !== "")
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  @MaxLength(64)
  buildingCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  buildingName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  floorCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  buildArea?: number;

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
