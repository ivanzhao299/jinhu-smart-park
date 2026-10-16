import {Type} from 'class-transformer';
import {IsIn,IsInt,IsOptional,IsString,Max,Min} from 'class-validator';
import {HR_EMPLOYEE_FEEDBACK_KINDS,HR_EMPLOYEE_FEEDBACK_STATUSES,type HrEmployeeFeedbackKind,type HrEmployeeFeedbackStatus,type HrEmployeeFeedbackView} from '@jinhu/shared';
export class HrEmployeeFeedbackPageDto {
 @IsIn(['mine','hr']) view!:HrEmployeeFeedbackView;
 @Type(()=>Number) @IsInt() @Min(1) @Max(1000000) page=1;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize=20;
 @IsOptional() @IsIn(HR_EMPLOYEE_FEEDBACK_KINDS) kind?:HrEmployeeFeedbackKind;
 @IsOptional() @IsIn(HR_EMPLOYEE_FEEDBACK_STATUSES) status?:HrEmployeeFeedbackStatus;
}
export class HrEmployeeFeedbackViewDto {@IsIn(['mine','hr']) view!:HrEmployeeFeedbackView;}
export class CreateHrEmployeeFeedbackDto {@IsIn(HR_EMPLOYEE_FEEDBACK_KINDS) kind!:HrEmployeeFeedbackKind;@IsString() title!:string;@IsString() content!:string;@IsString() reason!:string;}
export class EditHrEmployeeFeedbackDto extends CreateHrEmployeeFeedbackDto {@IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;}
export class HrEmployeeFeedbackCommandDto {@IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;@IsString() reason!:string;}
export class ReplyHrEmployeeFeedbackDto extends HrEmployeeFeedbackCommandDto {@IsString() reply!:string;}
