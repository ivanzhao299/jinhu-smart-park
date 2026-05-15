import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateModuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  moduleCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  moduleName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  moduleGroup!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  moduleVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  routePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  permissionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  iconKey?: string;

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
  remark?: string;
}
