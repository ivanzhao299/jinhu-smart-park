import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsUUID, ValidateNested } from "class-validator";

export class UserOrgAssignmentDto {
  @IsUUID()
  orgId!: string;

  @IsOptional()
  @IsUUID()
  postId?: string | null;

  @IsBoolean()
  isPrimary!: boolean;
}

export class ReplaceUserOrgsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UserOrgAssignmentDto)
  assignments!: UserOrgAssignmentDto[];
}
