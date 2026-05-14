import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateRoleDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
