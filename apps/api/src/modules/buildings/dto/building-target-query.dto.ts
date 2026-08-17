import { IsOptional, IsString, MaxLength } from "class-validator";

export class BuildingTargetQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkId?: string;
}
