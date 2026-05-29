import { Transform } from "class-transformer";
import { IsObject, IsOptional, IsString } from "class-validator";
import { trimOptional } from "./transformers";

export class CreateIotProtocolConfigDto {
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  protocol_type!: string;

  @IsString()
  @Transform(({ value }) => trimOptional(value))
  config_name!: string;

  @IsOptional()
  @IsObject()
  config_json?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
