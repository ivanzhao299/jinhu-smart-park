import { Type } from "class-transformer";
import { ArrayUnique, ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested } from "class-validator";
import { YUZHOU_INCREMENTAL_MAX_ITEMS, YUZHOU_INCREMENTAL_DOMAINS, YUZHOU_INCREMENTAL_PACKAGE_VERSION, YUZHOU_INITIAL_CANONICALIZATION, type YuzhouIncrementalDomain } from "@jinhu/shared";

const SHA256 = /^[a-f0-9]{64}$/;

export class YuzhouInitialBaselineWitnessDto {
  @IsIn([1]) version!: 1;
  @Matches(/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/) operationId!: string;
  @IsIn(["T0", "T2"]) phase!: "T0" | "T2";
  @IsIn([YUZHOU_INITIAL_CANONICALIZATION]) canonicalizationVersion!: typeof YUZHOU_INITIAL_CANONICALIZATION;
  @IsUUID() targetId!: string;
  @IsObject() projection!: Record<string, unknown>;
}

export class YuzhouProfileBaselineWitnessDto {
  @IsIn([1]) version!: 1;
  @IsIn(["original_t5_whole_set_v1"]) proof!: "original_t5_whole_set_v1";
  @Matches(/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/) operationId!: string;
  @Matches(SHA256) bindingSha256!: string;
}

export class YuzhouProfileAliasAcceptanceDto {
  @IsIn([1]) version!: 1;
  @IsIn(["original_t5_alias_fields_v1"]) proof!: "original_t5_alias_fields_v1";
  @Matches(/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/) operationId!: string;
  @Matches(SHA256) bindingSha256!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @ArrayUnique() @IsIn(["nativePlace","degree"], { each:true })
  fields!: Array<"nativePlace" | "degree">;
}

export class YuzhouInsurancePolicyTargetWitnessDto {
  @IsUUID() targetId!: string;
  @IsObject() projection!: Record<string, unknown>;
}
export class YuzhouInsurancePolicyBaselineWitnessDto {
  @Matches(/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/) operationId!: string;
  @IsObject() source!: Record<string, unknown>;
  @ValidateNested() @Type(() => YuzhouInsurancePolicyTargetWitnessDto)
  policy!: YuzhouInsurancePolicyTargetWitnessDto;
  @IsArray() @ArrayMinSize(6) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => YuzhouInsurancePolicyTargetWitnessDto)
  items!: YuzhouInsurancePolicyTargetWitnessDto[];
}

export class YuzhouIncrementalItemDto {
  @IsIn(YUZHOU_INCREMENTAL_DOMAINS) domain!: YuzhouIncrementalDomain;
  @IsString() @Length(1, 128) sourceTable!: string;
  @IsString() @Length(1, 256) sourceKey!: string;
  @IsOptional() @IsDateString() sourceUpdatedAt?: string;
  @Matches(SHA256) rowDigest!: string;
  @IsOptional() @ValidateNested() @Type(() => YuzhouInitialBaselineWitnessDto)
  initialBaselineWitness?: YuzhouInitialBaselineWitnessDto;
  @IsOptional() @ValidateNested() @Type(() => YuzhouProfileBaselineWitnessDto)
  profileBaselineWitness?: YuzhouProfileBaselineWitnessDto;
  @IsOptional() @ValidateNested() @Type(() => YuzhouProfileAliasAcceptanceDto)
  profileAliasAcceptance?: YuzhouProfileAliasAcceptanceDto;
  @IsOptional() @ValidateNested() @Type(() => YuzhouInsurancePolicyBaselineWitnessDto)
  insurancePolicyBaselineWitness?: YuzhouInsurancePolicyBaselineWitnessDto;
  @IsObject() fields!: Record<string, unknown>;
}

export class PreviewYuzhouIncrementalImportDto {
  @IsIn([YUZHOU_INCREMENTAL_PACKAGE_VERSION]) version!: typeof YUZHOU_INCREMENTAL_PACKAGE_VERSION;
  @IsIn(["yuzhou-v10"]) sourceSystem!: "yuzhou-v10";
  @IsString() @Length(1, 128) manifestId!: string;
  @IsDateString() extractedAt!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(YUZHOU_INCREMENTAL_MAX_ITEMS) @ValidateNested({ each: true }) @Type(() => YuzhouIncrementalItemDto)
  items!: YuzhouIncrementalItemDto[];
}
