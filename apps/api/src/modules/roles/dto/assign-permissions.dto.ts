import { ArrayMaxSize, IsArray, IsUUID } from "class-validator";

export const ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE = 1000;

export class AssignPermissionsDto {
  @IsArray()
  @ArrayMaxSize(ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE)
  @IsUUID("4", { each: true })
  permissionIds!: string[];
}
