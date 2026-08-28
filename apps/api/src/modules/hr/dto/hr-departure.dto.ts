import { Transform } from "class-transformer";
import { ArrayMaxSize,IsArray,IsDateString,IsIn,IsInt,IsNotEmpty,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min } from "class-validator";

const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;

export class HrDepartureListDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?:string;
 @IsOptional() @IsIn(["draft","submitted","returned","approved","cancelled","applied"]) status?:string;
}

export class SaveHrDepartureDto {
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(128) applicationName!:string;
 @IsUUID() employeeId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() applicationDate!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString() plannedDepartureDate!:string;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(64) departureType!:string;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!:string;
}

export class HrDepartureActionDto {
 @IsIn(["submit","resubmit","cancel"]) action!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string;
}

export class HrDepartureReviewDto {
 @IsIn(["approve","return"]) action!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string;
}

export class HrDepartureInterviewDto {
 @IsIn(["completed","waived"]) status!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(200) place?:string;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) summary!:string;
}

export class HrDepartureSurveyDto {
 @IsIn(["completed","waived"]) status!:string;
 @IsArray() @ArrayMaxSize(50) @IsString({each:true}) reasonCodes!:string[];
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) summary!:string;
}

export class HrDepartureHandoverDto {
 @IsIn(["completed","waived"]) status!:string;
 @IsOptional() @IsUUID() handoverToEmployeeId?:string;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) summary!:string;
}

export class HrDepartureWageDto {
 @IsIn(["settled","waived"]) status!:string;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(1000) note!:string;
}

export class HrDepartureArchiveDto {
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(1000) note!:string;
}
