import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  planCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  planName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  planType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  moduleCodes?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxParks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortNo?: number;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}
