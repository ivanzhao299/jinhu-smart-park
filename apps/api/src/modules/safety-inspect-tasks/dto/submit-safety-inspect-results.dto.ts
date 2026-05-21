import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";

export class SubmitSafetyInspectResultItemDto {
  @IsUUID()
  item_id!: string;

  @IsString()
  @MaxLength(32)
  result!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  value_text?: string;

  @IsOptional()
  @IsNumber()
  value_number?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID("4", { each: true })
  photo_file_ids?: string[];

  @IsOptional()
  @IsBoolean()
  create_hazard?: boolean;
}

export class SubmitSafetyInspectResultsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitSafetyInspectResultItemDto)
  results!: SubmitSafetyInspectResultItemDto[];

  @IsOptional()
  @IsBoolean()
  finish_task?: boolean;
}
