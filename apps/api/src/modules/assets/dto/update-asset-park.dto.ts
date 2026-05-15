import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateAssetParkDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parkName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalArea?: number;

  @IsOptional()
  @IsNumber()
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
