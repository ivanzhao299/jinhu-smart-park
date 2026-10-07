import { Transform } from "class-transformer";
import { IsDateString,IsIn,IsInt,IsOptional,IsString,IsUUID,Matches,Max,MaxLength,Min,ValidateIf } from "class-validator";

const trim=({value}:{value:unknown})=>typeof value==="string"?value.trim():value;

export class HrOnboardingListDto {
 @IsOptional() @IsIn(["initial","rehire"]) entryType?:"initial"|"rehire";
 @IsOptional() @IsUUID() employeeId?:string;
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?:string;
 @IsOptional() @IsIn(["draft","submitted","returned","approved","cancelled","confirmed"]) status?:string;
}

export class HrRehireOptionsDto {
 @Transform(({value})=>Number(value??1)) @IsInt() @Min(1) page=1;
 @Transform(({value})=>Number(value??20)) @IsInt() @Min(1) @Max(100) page_size=20;
 @IsIn(["employee","manager"]) kind:"employee"|"manager"="employee";
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?:string;
 @IsOptional() @IsUUID() employeeId?:string;
}

export class SaveHrOnboardingApplicationDto {
 @IsOptional() @IsIn(["initial","rehire"]) entryType?:"initial"|"rehire";
 @ValidateIf(d=>d.entryType==="rehire"||d.expectedEmployeeVersion!==undefined) @IsInt() @Min(1) expectedEmployeeVersion?:number;
 @ValidateIf(d=>d.entryType==="rehire"||d.targetOrgId!==undefined) @IsUUID() targetOrgId?:string;
 @ValidateIf(d=>d.entryType==="rehire"||d.targetPositionId!==undefined) @IsUUID() targetPositionId?:string;
 @ValidateIf(d=>(d.entryType==="rehire"||d.targetManagerEmployeeId!==undefined)&&d.targetManagerEmployeeId!==null) @IsUUID() targetManagerEmployeeId?:string|null;
 @Transform(trim) @IsString() @MaxLength(64) applicationName!:string;
 @IsUUID() employeeId!:string;
 @IsOptional() @IsUUID() candidateId?:string;
 @IsDateString() applicationDate!:string;
 @IsDateString() plannedHireDate!:string;
 @Transform(({value})=>Number(value)) @IsInt() @Min(0) @Max(12) probationMonths!:number;
 @Transform(trim) @Matches(/^\d{1,20}$/) attendanceCardNo!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(250) remark?:string;
}

export class HrOnboardingActionDto {
 @IsIn(["submit","resubmit","cancel"]) action!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string;
}

export class HrOnboardingReviewDto {
 @IsIn(["approve","return"]) action!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) comment?:string;
}
