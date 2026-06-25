import { IsBoolean, IsOptional } from "class-validator";

export class RunSafetyInspectRuntimeDto {
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;
}
