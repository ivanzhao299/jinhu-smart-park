import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class RobotLocalRegisterDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_code?: string;

  @IsString()
  @MaxLength(200)
  device_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  vendor_device_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @IsUUID()
  unit_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  online_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsObject()
  status_payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
