import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";

export class AssignRolesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  roleIds!: string[];
}

export class AssignParkRolesDto extends AssignRolesDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  parkId!: string;
}
