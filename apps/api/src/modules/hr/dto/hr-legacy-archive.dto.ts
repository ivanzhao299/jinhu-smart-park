import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

const optionalTrim=({value}:{value:unknown})=>typeof value==="string"&&value.trim()?value.trim():undefined;

export class HrLegacyArchiveQueryDto {
  @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
  @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
  @IsOptional() @IsIn(["mapped","archive_only","quarantine","resolved"]) status?:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(64) record_type?:string;
  @IsOptional() @IsUUID() employee_id?:string;
  @IsOptional() @Transform(optionalTrim) @IsString() @MaxLength(100) keyword?:string;
}
