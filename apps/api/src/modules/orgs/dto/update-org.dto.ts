import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class UpdateOrgDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

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
  leaderUserId?: string;

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
