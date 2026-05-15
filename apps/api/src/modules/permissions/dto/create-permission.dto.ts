import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class CreatePermissionDto {
  @IsString()
  @MaxLength(128)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 90))
  @IsInt()
  @IsIn([10, 20, 30, 40, 50, 60, 70, 80, 90])
  permType?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  resource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 0))
  @IsInt()
  @Min(0)
  sortNo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  apiMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  frontendRoute?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  componentKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  fieldKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  dataDimension?: string;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
