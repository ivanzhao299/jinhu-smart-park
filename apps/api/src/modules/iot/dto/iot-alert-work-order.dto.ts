import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { trimOptional } from "./transformers";

export class IotAlertWorkOrderDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  title!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  priority!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  urgency!: string;

  @IsOptional()
  @IsUUID()
  assignee_id?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  wo_type?: string;
}
