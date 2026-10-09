import {Transform} from "class-transformer";
import {IsIn,IsInt,IsNotEmpty,IsOptional,IsString,IsUUID,Max,MaxLength,Min,ValidateIf} from "class-validator";
const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;
export class UpdateHrPositionMaintenanceDto {
 @IsInt() @Min(1) @Max(2147483647) expectedVersion!:number;
 @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500) reason!:string;
 @ValidateIf((_,value)=>value!==undefined) @IsUUID() orgId?:string;
 @ValidateIf((_,value)=>value!==undefined) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(64) positionCode?:string;
 @ValidateIf((_,value)=>value!==undefined) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) positionName?:string;
 @IsOptional() @IsUUID() reportsToPositionId?:string|null;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(64) jobFamily?:string|null;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(32) jobLevel?:string|null;
 @IsOptional() @IsInt() @Min(0) @Max(100000) headcountLimit?:number|null;
 @IsOptional() @IsInt() @Min(0) @Max(32767) hierarchyLevel?:number|null;
 @ValidateIf((_,value)=>value!==undefined) @IsInt() @Min(0) @Max(2147483647) sortOrder?:number;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1024) authority?:string|null;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1024) qualification?:string|null;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1024) responsibilities?:string|null;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(256) positionManual?:string|null;
 @ValidateIf((_,value)=>value!==undefined) @IsIn(["enabled","disabled"]) status?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?:string|null;
}
