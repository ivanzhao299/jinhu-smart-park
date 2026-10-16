import {Type} from 'class-transformer';
import {ArrayMaxSize,ArrayMinSize,IsArray,IsDateString,IsInt,IsObject,IsOptional,IsString,IsUUID,Max,MaxLength,Min,MinLength,Validate,ValidatorConstraint,type ValidatorConstraintInterface} from 'class-validator';
import {validateHrPerformanceInputChanges,type HrPerformanceInputChange,type HrPerformanceWorkflowPolicy} from '@jinhu/shared';
@ValidatorConstraint({name:'channelInputChanges',async:false})
export class HrPerformanceInputChangesConstraint implements ValidatorConstraintInterface {validate(v:unknown){try{validateHrPerformanceInputChanges(v);return true;}catch{return false;}}defaultMessage(){return 'Invalid performance channel input changes';}}
export class SaveHrPerformanceWorkflowPolicyDto {
 @IsUUID() expectedDefinitionRevisionId!:string;
 @IsOptional() @IsUUID() expectedWorkflowRevisionId!:string|null;
 @IsObject() policy!:HrPerformanceWorkflowPolicy;
}
export class PatchHrPerformanceChannelInputDto {
 @IsUUID() expectedRevisionId!:string;
 @Validate(HrPerformanceInputChangesConstraint) changes!:HrPerformanceInputChange[];
}
export class HrPerformanceChannelRevisionDto {@IsUUID() inputRevisionId!:string;}
export class HrPerformanceChannelInputQueryDto {
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(1000000) page=1;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize=10;
}
export class HrPerformanceChannelCompleteBatchDto {@IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('4',{each:true}) reviewIds?:string[];}
export class CreateHrPerformanceCorrectionCycleDto {
 @IsString() @MinLength(1) @MaxLength(64) cycleCode!:string;
 @IsString() @MinLength(1) @MaxLength(120) cycleName!:string;
 @IsDateString() startDate!:string;
 @IsDateString() endDate!:string;
 @IsUUID() templateVersionId!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('4',{each:true}) predecessorReviewIds!:string[];
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('4',{each:true}) selectedEmployeeIds!:string[];
 @IsString() @MinLength(2) @MaxLength(2000) correctionReason!:string;
 @IsString() @MinLength(1) @MaxLength(120) businessPeriodRef!:string;
}
