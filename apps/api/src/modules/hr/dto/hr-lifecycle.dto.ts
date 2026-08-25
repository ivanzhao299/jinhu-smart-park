import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
export class HrLifecycleListDto {
  @Transform(({ value }) => Number(value ?? 1)) @IsInt() @Min(1) page = 1;
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
  @IsOptional() @IsIn(["onboarding", "offboarding"]) type?: string;
  @IsOptional()
  @IsIn(["open", "in_progress", "completed", "cancelled"])
  status?: string;
  @IsOptional() @IsUUID() employee_id?: string;
}
export class HrLifecycleTemplateItemDto {
  @Transform(trim) @IsString() @MaxLength(64) code!: string;
  @Transform(trim) @IsString() @MaxLength(160) name!: string;
  @Transform(trim) @IsString() @MaxLength(32) category!: string;
  @IsOptional() @IsInt() @Min(-365) @Max(365) defaultDueDays?: number;
  @IsOptional() @IsBoolean() required?: boolean;
}
export class CreateHrLifecycleTemplateDto {
  @Transform(trim) @IsString() @MaxLength(64) code!: string;
  @Transform(trim) @IsString() @MaxLength(160) name!: string;
  @IsIn(["onboarding", "offboarding"]) type!: string;
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => HrLifecycleTemplateItemDto)
  items!: HrLifecycleTemplateItemDto[];
}
export class CreateHrLifecycleTemplateVersionDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => HrLifecycleTemplateItemDto)
  items!: HrLifecycleTemplateItemDto[];
}
export class CreateHrLifecycleChecklistDto {
  @IsUUID() employeeId!: string;
  @IsUUID() templateVersionId!: string;
  @IsOptional() @IsUUID() employmentEventId?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
export class HrLifecycleItemActionDto {
  @IsIn(["complete", "waive", "return", "reassign", "correct"]) action!: string;
  @IsOptional() @IsUUID() assigneeUserId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}
export class CreateHrEmployeeRecordDto {
  @IsIn(["family", "education", "work", "skill", "credential"])
  recordType!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  relationship?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) fullName?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  identityNumber?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(64) contact?: string;
  @IsOptional() @IsBoolean() isEmergencyContact?: boolean;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  organizationName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) summary?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) skillName?: string;
  @IsOptional()
  @IsIn(["basic", "intermediate", "advanced", "expert"])
  proficiency?: string;
  @IsOptional() @IsDateString() acquiredDate?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  credentialType?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  credentialName?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  credentialNumber?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  issuingAuthority?: string;
  @IsOptional() @IsDateString() validTo?: string;
}
