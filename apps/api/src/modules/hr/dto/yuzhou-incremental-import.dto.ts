import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsObject, IsOptional, IsString, Length, Matches, ValidateNested } from "class-validator";
import { YUZHOU_INCREMENTAL_DOMAINS, YUZHOU_INCREMENTAL_PACKAGE_VERSION, type YuzhouIncrementalDomain } from "@jinhu/shared";

const SHA256 = /^[a-f0-9]{64}$/;

export class YuzhouIncrementalItemDto {
  @IsIn(YUZHOU_INCREMENTAL_DOMAINS) domain!: YuzhouIncrementalDomain;
  @IsString() @Length(1, 128) sourceTable!: string;
  @IsString() @Length(1, 256) sourceKey!: string;
  @IsOptional() @IsDateString() sourceUpdatedAt?: string;
  @Matches(SHA256) rowDigest!: string;
  @IsObject() fields!: Record<string, unknown>;
}

export class PreviewYuzhouIncrementalImportDto {
  @IsIn([YUZHOU_INCREMENTAL_PACKAGE_VERSION]) version!: typeof YUZHOU_INCREMENTAL_PACKAGE_VERSION;
  @IsIn(["yuzhou-v10"]) sourceSystem!: "yuzhou-v10";
  @IsString() @Length(1, 128) manifestId!: string;
  @IsDateString() extractedAt!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => YuzhouIncrementalItemDto)
  items!: YuzhouIncrementalItemDto[];
}
