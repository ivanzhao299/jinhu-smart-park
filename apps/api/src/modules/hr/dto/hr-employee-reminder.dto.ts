import { Transform } from "class-transformer";
import { ArrayUnique, IsDateString, Matches, ValidateIf, ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const EMPLOYEE_REMINDER_KINDS=["birthday","hire_anniversary"] as const;
export const EMPLOYEE_REMINDER_RECIPIENTS=["hr","manager","employee"] as const;
export const EMPLOYEE_REMINDER_LEAP_POLICIES=["skip","feb_28","mar_1"] as const;
export const EMPLOYEE_REMINDER_STATUSES=["open","read","acknowledged","resolved","cancelled"] as const;

export class HrEmployeeReminderGenerateDto {
 @IsIn(EMPLOYEE_REMINDER_KINDS) kind!:typeof EMPLOYEE_REMINDER_KINDS[number];
 @Transform(({value})=>typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN) @IsInt() @Min(0) @Max(365) windowDays!:number;
 @IsIn(EMPLOYEE_REMINDER_LEAP_POLICIES) leapDayPolicy!:typeof EMPLOYEE_REMINDER_LEAP_POLICIES[number];
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ArrayUnique() @IsIn(EMPLOYEE_REMINDER_RECIPIENTS,{each:true}) recipients!:Array<typeof EMPLOYEE_REMINDER_RECIPIENTS[number]>;
 @ValidateIf((_,value)=>value!==undefined) @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({strict:true}) @MaxLength(10) businessDate?:string;
}
export class HrEmployeeReminderQueryDto {
 @IsOptional() @IsIn(EMPLOYEE_REMINDER_KINDS) kind?:typeof EMPLOYEE_REMINDER_KINDS[number];
 @IsOptional() @IsIn(EMPLOYEE_REMINDER_STATUSES) status?:typeof EMPLOYEE_REMINDER_STATUSES[number];
 @IsOptional() @Transform(({value})=>typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN) @IsInt() @Min(0) @Max(365) window_days?:number;
 @IsOptional() @Transform(({value})=>typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN) @IsInt() @Min(1) page=1;
 @IsOptional() @Transform(({value})=>typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN) @IsInt() @Min(1) @Max(100) page_size=20;
}
export class HrEmployeeReminderActionDto {
 @IsIn(["read","acknowledge","resolve","cancel"]) action!:"read"|"acknowledge"|"resolve"|"cancel";
 @IsOptional() @IsString() @MaxLength(1000) comment?:string;
}
