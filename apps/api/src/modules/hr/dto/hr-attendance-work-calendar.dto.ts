import {Transform,Type} from "class-transformer";
import {IsDateString,IsIn,IsInt,IsNotEmpty,IsString,Matches,Max,MaxLength,Min} from "class-validator";

import {WORK_CALENDAR_KINDS,type WorkCalendarBody,type WorkCalendarKind} from "@jinhu/shared";
export type {WorkCalendarKind} from "@jinhu/shared";
const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;
export class HrWorkCalendarDateDto {
 @Matches(/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/) @IsDateString({strict:true}) date!:string;
}
export class HrWorkCalendarRangeDto {
 @Matches(/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/) @IsDateString({strict:true}) from!:string;
 @Matches(/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/) @IsDateString({strict:true}) to!:string;
}
export class HrWorkCalendarHistoryDto {
 @Type(()=>Number) @IsInt() @Min(1) @Max(100000) page=1;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100) page_size=20;
}
export class PutHrWorkCalendarDto implements WorkCalendarBody {
 @IsInt() @Min(0) @Max(2147483646) expectedVersion!:number;
 @IsIn(WORK_CALENDAR_KINDS) dayKind!:WorkCalendarKind;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) dayName!:string;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500) reason!:string;
}
