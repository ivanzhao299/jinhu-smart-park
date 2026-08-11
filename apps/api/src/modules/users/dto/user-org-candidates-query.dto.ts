import { IsOptional, IsString, MaxLength } from "class-validator";

export class UserOrgCandidatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkId?: string;
}
