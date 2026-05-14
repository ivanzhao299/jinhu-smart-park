import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

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
  sortOrder?: number;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
