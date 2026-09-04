import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { trimOrgContactValue } from "./org-contact.transform";

export class CreateOrgDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @MaxLength(64)
  orgCode!: string;

  @IsString()
  @MaxLength(100)
  orgName!: string;

  @IsString()
  @MaxLength(32)
  orgType!: string;

  @IsOptional()
  @IsUUID()
  leaderUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  legacyHierarchyLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  plannedHeadcount?: number;

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
