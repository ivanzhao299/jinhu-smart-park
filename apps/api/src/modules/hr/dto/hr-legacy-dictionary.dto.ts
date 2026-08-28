import { Type, Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;
const optionalTrim=({value}:{value:unknown})=>typeof value==="string"?(value.trim()||undefined):value;
const dictionaryCodes=["employee_job_state","employment_event_type","employment_event_state","contract_type","contract_state"] as const;
const decisions=["map","raw_only","reject"] as const;

export class HrLegacyDictionaryListQueryDto {
  @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
  @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
  @IsOptional() @IsIn(dictionaryCodes) dictionary_code?:string;
  @IsOptional() @IsIn(["draft","approved","superseded"]) status?:string;
}

export class HrLegacyDictionaryItemInputDto {
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(128) sourceCode?:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(255) sourceName?:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(255) sourceValue?:string;
  @Matches(/^[0-9a-f]{64}$/) sourceIdentitySha256!:string;
  @Matches(/^[0-9a-f]{64}$/) sourceRowSha256!:string;
  @IsIn(decisions) decision!:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(64) targetDomain?:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(64) targetValue?:string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(64) reasonCode!:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(500) reviewNote?:string;
}

export class CreateHrLegacyDictionaryDraftDto {
  @IsIn(dictionaryCodes) dictionaryCode!:string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(128) sourceTable!:string;
  @Matches(/^[0-9a-f]{64}$/) sourceSnapshotSha256!:string;
  @IsInt() @Min(0) @Max(10000) sourceRowCount!:number;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(500) decisionNote?:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10000)
  @ValidateNested({each:true}) @Type(()=>HrLegacyDictionaryItemInputDto)
  items!:HrLegacyDictionaryItemInputDto[];
}

export class UpdateHrLegacyDictionaryItemDto {
  @IsIn(decisions) decision!:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(64) targetDomain?:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(64) targetValue?:string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(64) reasonCode!:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(500) reviewNote?:string;
}

export class ApproveHrLegacyDictionaryDto {
  @Matches(/^[0-9a-f]{64}$/) sourceSnapshotSha256!:string;
}
