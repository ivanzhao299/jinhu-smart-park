import { Transform } from "class-transformer";
import { IsArray, IsOptional, IsString, IsUUID } from "class-validator";
import { normalizeStringArray, trimOptional } from "./create-work-order.dto";

export class FinishWorkOrderDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  resolve_note!: string;

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @IsUUID("4", { each: true })
  image_file_ids?: string[];
}
