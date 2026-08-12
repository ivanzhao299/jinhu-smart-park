import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

export class PropertyRoleBundleReferenceDto {
  @IsString()
  @Matches(/^property-bundle:[a-z][a-z0-9-]*$/)
  code!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @Matches(/^[0-9a-f]{64}$/)
  hash!: string;
}

export class PreviewPropertyRoleBundlesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => PropertyRoleBundleReferenceDto)
  bundles!: PropertyRoleBundleReferenceDto[];

  @IsIn(["merge", "sync"])
  mode!: "merge" | "sync";
}

export class CreatePropertyRoleFromBundlesDto extends PreviewPropertyRoleBundlesDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{2,63}$/)
  code!: string;

  @IsString()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @MaxLength(500)
  remark?: string;

  @Matches(/^[0-9a-f]{64}$/)
  previewSignature!: string;
}

export class ApplyPropertyRoleBundlesDto extends PreviewPropertyRoleBundlesDto {
  @IsInt()
  @Min(1)
  roleVersion!: number;

  @Matches(/^[0-9a-f]{64}$/)
  previewSignature!: string;

  @IsOptional()
  @IsBoolean()
  confirmRemovals?: boolean;
}
