import {Transform} from 'class-transformer';
import {ArrayMaxSize,ArrayMinSize,ArrayUnique,IsArray,IsIn,IsInt,IsString,IsUUID,Matches,Max,MaxLength,Min,MinLength} from 'class-validator';
export class EnterpriseMemberCreateDto{
 @Matches(/^[A-Za-z0-9_.@-]{1,64}$/) username!:string;
 @IsString() @MinLength(1) @MaxLength(100) displayName!:string;
 @IsString() @MinLength(12) @MaxLength(128) password!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsUUID(undefined,{each:true}) roleIds!:string[];
 @IsString() @MinLength(2) @MaxLength(1000) reason!:string;
}
export class EnterpriseMemberRolesDto{
 @IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;
 @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID(undefined,{each:true}) roleIds!:string[];
 @IsString() @MinLength(2) @MaxLength(1000) reason!:string;
}
export class EnterpriseMemberStateDto{
 @IsInt() @Min(1) @Max(2147483646) expectedVersion!:number;
 @IsIn(['enabled','disabled']) status!:'enabled'|'disabled';
 @IsString() @MinLength(2) @MaxLength(1000) reason!:string;
}
export class EnterpriseRoleCreateDto{
 @Matches(/^[A-Za-z0-9_-]{1,64}$/) code!:string;
 @IsString() @MinLength(1) @MaxLength(100) name!:string;
 @IsIn(['self','org','park']) dataScope!:'self'|'org'|'park';
 @IsArray() @ArrayMaxSize(500) @ArrayUnique() @IsString({each:true}) permissionCodes!:string[];
 @IsString() @MinLength(2) @MaxLength(1000) reason!:string;
}
export class EnterpriseMemberQueryDto{
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) @Max(1000000) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
}
