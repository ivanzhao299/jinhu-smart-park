import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class FieldPermissionDto {
  @IsString()
  @MaxLength(128)
  resource!: string;

  @IsString()
  @MaxLength(128)
  fieldKey!: string;

  @IsString()
  @MaxLength(100)
  fieldName!: string;

  @IsIn(["none", "read", "write", "mask"])
  accessMode!: "none" | "read" | "write" | "mask";
}

export class AssignFieldPermissionsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FieldPermissionDto)
  fields!: FieldPermissionDto[];
}
