import { IsArray, IsUUID } from "class-validator";

export class AssignRoleDataScopesDto {
  @IsArray()
  @IsUUID("4", { each: true })
  ruleIds!: string[];
}
