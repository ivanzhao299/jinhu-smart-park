import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { trimOrgContactValue } from "./org-contact.transform";

export class UpdateOrgDto {
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  orgCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orgName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  orgType?: string;

  @IsOptional()
  @IsUUID()
  leaderUserId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  legacyHierarchyLevel?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  plannedHeadcount?: number | null;

  @IsOptional()
  @Transform(trimOrgContactValue)
  @IsString()
  @MaxLength(50)
  contactPhone?: string | null;

  @IsOptional()
  @Transform(trimOrgContactValue)
  @IsString()
  @MaxLength(500)
  contactAddress?: string | null;

  @IsOptional()
  @Transform(trimOrgContactValue)
  @IsString()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
