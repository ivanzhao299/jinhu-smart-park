import {Allow,IsIn,IsInt,IsString,IsUUID,Matches,Max,Min} from 'class-validator';
import {Type} from 'class-transformer';
import type {HrPerformanceSourceTemplateTarget} from '@jinhu/shared';
export class HrPerformanceSourceActivationPreviewDto {@IsUUID() expectedRevisionId!:string;}
export class HrPerformanceSourceActivationPageDto {@Type(()=>Number) @IsInt() @Min(1) @Max(1000000) page=1;@Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize=20;}
export class HrPerformanceSourceTemplateActivationDto {
 @IsUUID() expectedRevisionId!:string;
 @IsString() @Matches(/^[0-9a-f]{64}$/) expectedManifestSha256!:string;
 @IsString() @Matches(/^[0-9a-f]{64}$/) expectedQualificationSha256!:string;
 @Allow() target!:HrPerformanceSourceTemplateTarget;
 @IsString() reason!:string;
 @IsString() @Matches(/^[0-9a-f]{64}$/) acknowledgedDifferenceSha256!:string;
}
export class HrPerformanceSourceReviewActivationDto extends HrPerformanceSourceTemplateActivationDto {@IsIn(['qualified_source','manual_current']) mode!:'qualified_source'|'manual_current';@IsString() cycleCode!:string;@IsString() cycleName!:string;}
