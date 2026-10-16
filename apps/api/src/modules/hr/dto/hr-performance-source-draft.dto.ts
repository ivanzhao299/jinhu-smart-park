import {Type} from 'class-transformer';
import {IsIn,IsInt,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min,MinLength,Allow} from 'class-validator';
import type {HrPerformanceSourceDraftKind,HrPerformanceSourcePatch,HrPerformanceSourceChange,HrPerformanceSourceBinding,HrPerformanceChannelDefinition,HrPerformanceWorkflowPolicy} from '@jinhu/shared';
export class HrPerformanceSourcePageDto {
 @Type(()=>Number) @IsInt() @Min(1) @Max(1000000) page=1;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize=10;
}
export class HrPerformanceSourceKindPageDto extends HrPerformanceSourcePageDto { @IsIn(['template','review']) kind!:HrPerformanceSourceDraftKind; }
export class HrPerformanceSourceCandidatesDto extends HrPerformanceSourceKindPageDto { @IsOptional() @IsUUID() draftId?:string; }
export class HrPerformanceSourcePreviewDto { @IsIn(['template','review']) kind!:HrPerformanceSourceDraftKind; @IsUUID() sourceId!:string; }
export class CreateHrPerformanceSourceDraftDto extends HrPerformanceSourcePreviewDto { @IsString() @Matches(/^[0-9a-f]{64}$/) expectedManifestSha256!:string; }
export class RefreshHrPerformanceSourceDraftDto {
 @IsUUID() sourceId!:string; @IsUUID() expectedRevisionId!:string;
 @IsString() @Matches(/^[0-9a-f]{64}$/) expectedManifestSha256!:string;
 @IsString() @MinLength(2) @MaxLength(2000) @Matches(/\S/) reason!:string;
}
export class PatchHrPerformanceSourceDraftDto implements HrPerformanceSourcePatch {
 @IsUUID() expectedRevisionId!:string;
 @IsString() @MinLength(2) @MaxLength(2000) @Matches(/\S/) reason!:string;
 @IsOptional() @Allow() changes?:HrPerformanceSourceChange[];
 @IsOptional() @Allow() binding?:HrPerformanceSourceBinding;
 @IsOptional() @Allow() definition?:HrPerformanceChannelDefinition|null;
 @IsOptional() @Allow() workflow?:HrPerformanceWorkflowPolicy|null;
}

export class HrPerformanceSourceOptionsDto extends HrPerformanceSourceKindPageDto {
 @IsIn(['org','employee']) resource!:'org'|'employee';
 @IsOptional() @IsString() @MaxLength(100) q?:string;
}
