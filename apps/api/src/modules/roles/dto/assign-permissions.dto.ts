import { ArrayMaxSize, IsArray, IsUUID } from "class-validator";

export class AssignPermissionsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  permissionIds!: string[];
}
