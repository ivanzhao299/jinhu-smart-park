import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;
export class HrRecordVersionDto {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;
}
export class UpdateHrExperienceRecordDto extends HrRecordVersionDto {
  @ValidateIf((_o,v)=>v!==undefined)
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) organizationName?:string;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Transform(trim) @IsString() @MaxLength(160) title?:string|null;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Transform(trim) @IsString() @MaxLength(2000) summary?:string|null;
  @ValidateIf((_o,v)=>v!==undefined)
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true,strictSeparator:true}) startDate?:string;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true,strictSeparator:true}) endDate?:string|null;
  @ValidateIf((_o,v)=>v!==undefined) @IsIn(["education","work"]) type?:"education"|"work";
}
export class UpdateHrSkillRecordDto extends HrRecordVersionDto {
  @ValidateIf((_o,v)=>v!==undefined)
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) skillName?:string;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Transform(trim) @IsString() @MaxLength(2000) note?:string|null;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Transform(trim) @IsString() @MaxLength(64) legacyGrade?:string|null;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true,strictSeparator:true}) acquiredDate?:string|null;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null) @IsIn(["basic","intermediate","advanced","expert"]) proficiency?:string|null;
}
export class UpdateHrCredentialRecordDto extends HrRecordVersionDto {
  @ValidateIf((_o,v)=>v!==undefined)
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(64) credentialType?:string;
  @ValidateIf((_o,v)=>v!==undefined)
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) credentialName?:string;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Transform(trim) @IsString() @MaxLength(64) credentialNumber?:string|null;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Transform(trim) @IsString() @MaxLength(200) issuingAuthority?:string|null;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Transform(trim) @IsString() @MaxLength(2000) note?:string|null;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true,strictSeparator:true}) acquiredDate?:string|null;
  @ValidateIf((_o,v)=>v!==undefined&&v!==null)
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true,strictSeparator:true}) validTo?:string|null;
}
