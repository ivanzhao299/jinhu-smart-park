import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class SelectContextDto {
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @IsString()
  @MaxLength(64)
  parkId!: string;

  @IsUUID()
  userId!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(256)
  ticket!: string;
}
