import { ArrayMaxSize, IsArray, IsUUID } from "class-validator";

export class AssignRolesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  roleIds!: string[];
}
