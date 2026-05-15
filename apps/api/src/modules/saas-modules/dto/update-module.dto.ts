import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  moduleCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  moduleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  moduleGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  moduleVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  routePath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  permissionCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  iconKey?: string | null;

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
