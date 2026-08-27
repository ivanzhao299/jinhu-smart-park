import { Transform,Type } from "class-transformer";
import { ArrayMaxSize,ArrayMinSize,IsArray,IsDateString,IsIn,IsInt,IsNotEmpty,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min,ValidateNested } from "class-validator";

const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;

export class HrProbationListDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?:string;
 @IsOptional() @IsIn(["draft","submitted","returned","approved","cancelled","confirmed"]) status?:string;
}

export class HrProbationParticipantDto {
 @IsUUID() employeeId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() plannedConfirmationDate!:string;
}

export class SaveHrProbationApplicationDto {
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(128) applicationName!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() applicationDate!:string;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>HrProbationParticipantDto) participants!:HrProbationParticipantDto[];
}

export class HrProbationActionDto {
 @IsIn(["submit","resubmit","cancel"]) action!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string;
}

export class HrProbationReviewDto {
 @IsIn(["approve","return"]) action!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string;
}
