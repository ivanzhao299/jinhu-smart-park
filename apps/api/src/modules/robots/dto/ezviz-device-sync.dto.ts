import { Transform } from "class-transformer";
import { IsOptional, IsString } from "class-validator";

const trimOptional = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
};

export class EzvizDeviceSyncDto {
  @IsString()
  @Transform(({ value }) => String(value ?? "").trim())
  device_serial!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  device_name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  location?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}

export class EzvizDeviceAddDto extends EzvizDeviceSyncDto {
  @IsString()
  @Transform(({ value }) => String(value ?? "").trim())
  validate_code!: string;
}
