import { Transform } from "class-transformer";
import { IsString, MaxLength } from "class-validator";
import { trimOptional } from "./transformers";

export class UpdateIotDeviceStatusDto {
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  status!: string;
}
