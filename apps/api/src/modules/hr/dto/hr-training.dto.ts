import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;
const DECIMAL=/^(0|[1-9]\d{0,15})(\.\d{1,4})?$/;
const HOURS=/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/;
export class HrTrainingListDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @IsIn(["draft","published","in_progress","completed","cancelled"]) status?:string;
}
export class CreateHrTrainingCourseDto {
 @Transform(trim) @IsString() @MaxLength(64) code!:string;
 @Transform(trim) @IsString() @MaxLength(160) title!:string;
 @Transform(trim) @IsString() @MaxLength(64) category!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(160) provider?:string;
 @Transform(trim) @Matches(HOURS) hours!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) description?:string;
}
export class CreateHrTrainingCourseVersionDto {
 @Transform(trim) @IsString() @MaxLength(160) title!:string;
 @Transform(trim) @IsString() @MaxLength(64) category!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(160) provider?:string;
 @Transform(trim) @Matches(HOURS) hours!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) description?:string;
}
export class CreateHrTrainingPlanDto {
 @Transform(trim) @IsString() @MaxLength(64) code!:string;
 @Transform(trim) @IsString() @MaxLength(160) name!:string;
 @IsUUID() courseId!:string;
 @IsBoolean() mandatory!:boolean;
 @IsDateString() startDate!:string;
 @IsDateString() endDate!:string;
 @Transform(trim) @Matches(DECIMAL) budgetAmount!:string;
 @Transform(trim) @Matches(/^[A-Z]{3}$/) costCurrency!:string;
 @IsArray() @ArrayMaxSize(500) @IsUUID("4",{each:true}) employeeIds!:string[];
}
export class CreateHrTrainingPositionRequirementDto {
 @IsUUID() positionId!:string;
 @IsUUID() courseId!:string;
}
export class HrTrainingParticipantResultDto {
 @IsOptional() @IsString() @MaxLength(2000) @Matches(/^[^\0\p{Surrogate}]*$/u) memo?:string|null;
 @Transform(trim) @Matches(HOURS) completedHours!:string;
 @IsOptional() @Transform(trim) @Matches(/^(100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/) score?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) evaluation?:string;
 @IsOptional() @Transform(trim) @Matches(DECIMAL) actualCost?:string;
 @IsOptional() @IsUUID() certificateFileId?:string;
}
export class HrTrainingCorrectionDto {
 @IsInt() @Min(0) expectedRevision!:number;
 @IsOptional() @IsString() @MaxLength(2000) @Matches(/^[^\0\p{Surrogate}]*$/u) correctedMemo?:string|null;
 @ValidateIf((_object,value)=>value!==undefined) @Transform(trim) @Matches(HOURS) correctedHours?:string;
 @IsOptional() @Transform(trim) @Matches(/^(100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/) correctedScore?:string|null;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) correctedEvaluation?:string|null;
 @IsOptional() @Transform(trim) @Matches(DECIMAL) correctedActualCost?:string|null;
 @IsOptional() @IsUUID() certificateFileId?:string|null;
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) @Matches(/^[^\0\p{Surrogate}]+$/u) reason!:string;
}

export class HrTrainingPlanFactsDto {
 @IsInt() @Min(0) expectedRevision!:number;
 @ValidateIf((_object,value)=>value!==undefined) @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) @Matches(/^[^\0\p{Surrogate}]+$/u) courseName?:string;
 @ValidateIf((_object,value)=>value!==undefined) @IsDateString({strict:true}) @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/) startDate?:string;
 @ValidateIf((_object,value)=>value!==undefined) @IsDateString({strict:true}) @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/) endDate?:string;
 @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) @Matches(/^[^\0\p{Surrogate}]+$/u) reason!:string;
}
