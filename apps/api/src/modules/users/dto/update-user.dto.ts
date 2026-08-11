import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { UserOrgAssignmentDto } from "./replace-user-orgs.dto";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessibleParkIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UserOrgAssignmentDto)
  assignments?: UserOrgAssignmentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  mobile?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(128)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  gender?: string;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
