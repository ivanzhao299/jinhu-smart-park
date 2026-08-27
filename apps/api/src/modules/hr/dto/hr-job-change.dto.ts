import { Transform } from "class-transformer";
import { IsDateString,IsIn,IsInt,IsNotEmpty,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min } from "class-validator";

const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;

export class HrJobChangeListDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?:string;
 @IsOptional() @IsIn(["draft","submitted","returned","approved","cancelled","applied"]) status?:string;
}

export class SaveHrJobChangeDto {
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(128) applicationName!:string;
 @IsUUID() employeeId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() applicationDate!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() effectiveDate!:string;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(64) changeType!:string;
 @IsUUID() afterOrgId!:string;
 @IsOptional() @IsUUID() afterPositionId?:string;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!:string;
}

export class HrJobChangeActionDto {
 @IsIn(["submit","resubmit","cancel"]) action!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string;
}

export class HrJobChangeReviewDto {
 @IsIn(["approve","return"]) action!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string;
}
