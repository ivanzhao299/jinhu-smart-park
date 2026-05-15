import { IsArray, IsUUID } from "class-validator";

export class AssignRoleFieldPoliciesDto {
  @IsArray()
  @IsUUID("4", { each: true })
  fieldPolicyIds!: string[];
}
