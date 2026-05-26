import { Transform } from "class-transformer";
import { IsDateString, IsOptional } from "class-validator";
import { trimOptional } from "./transformers";

export class VideoPlaybackQueryDto {
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  start_time?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  end_time?: string;
}
