import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
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
 @Transform(trim) @Matches(HOURS) completedHours!:string;
 @IsOptional() @Transform(trim) @Matches(/^(100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/) score?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) evaluation?:string;
 @IsOptional() @Transform(trim) @Matches(DECIMAL) actualCost?:string;
 @IsOptional() @IsUUID() certificateFileId?:string;
}
export class HrTrainingCorrectionDto {
 @IsOptional() @Transform(trim) @Matches(HOURS) correctedHours?:string;
 @IsOptional() @Transform(trim) @Matches(/^(100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/) correctedScore?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) correctedEvaluation?:string;
 @IsOptional() @Transform(trim) @Matches(DECIMAL) correctedActualCost?:string;
 @IsOptional() @IsUUID() certificateFileId?:string;
 @Transform(trim) @IsString() @MaxLength(1000) reason!:string;
}
