import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { optionalInteger, trimOptional } from "./transformers";

export class VideoPlatformConfigQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  platform_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  sort?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => optionalInteger(value))
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Transform(({ value }) => optionalInteger(value))
  page_size?: number;
}
