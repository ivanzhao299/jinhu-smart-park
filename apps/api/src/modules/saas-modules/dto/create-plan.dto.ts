import { IsArray, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  planCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  planName!: string;

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
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];

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
  @IsObject()
  featureConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
