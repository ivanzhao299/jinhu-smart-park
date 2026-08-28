import {Transform} from "class-transformer";
import {IsIn,IsInt,IsOptional,IsString,Max,MaxLength,Min} from "class-validator";
export class HrContractReminderQueryDto{
 @IsOptional() @IsIn(["open","read","acknowledged","resolved","cancelled"]) status?:string;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page=1;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) page_size=20;
}
export class HrContractReminderActionDto{
 @IsIn(["read","acknowledge","resolve","cancel"]) action!:"read"|"acknowledge"|"resolve"|"cancel";
 @IsOptional() @IsString() @MaxLength(1000) comment?:string;
}
