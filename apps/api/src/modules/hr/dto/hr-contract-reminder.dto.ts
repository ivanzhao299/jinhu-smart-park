import {Transform} from "class-transformer";
import {IsIn,IsInt,IsOptional,IsString,Max,MaxLength,Min} from "class-validator";
export class HrContractReminderQueryDto{
 @IsOptional() @IsIn(["open","read","acknowledged","resolved","cancelled"]) status?:string;
 @IsOptional() @IsIn(["contract_expiry","probation_expiry"]) kind?:"contract_expiry"|"probation_expiry";
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @IsIn([30,60,90]) window_days?:number;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) page=1;
 @IsOptional() @Transform(({value})=>Number(value)) @IsInt() @Min(1) @Max(100) page_size=20;
}
export class HrContractReminderActionDto{
 @IsIn(["read","acknowledge","resolve","cancel"]) action!:"read"|"acknowledge"|"resolve"|"cancel";
 @IsOptional() @IsString() @MaxLength(1000) comment?:string;
}
