import { IsArray, IsNumber, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class RobotCleanControlDto {
  @IsString()
  @MaxLength(40)
  command!: string;
}

export class RobotCommandDryRunDto {
  @IsString()
  @MaxLength(80)
  command!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class RobotCleanModeDto {
  @IsString()
  @MaxLength(80)
  mode!: string;
}

export class RobotRegionDto {
  @IsString()
  @MaxLength(80)
  region_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clean_mode?: string;
}

export class RobotRegionCleanDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RobotRegionDto)
  regions!: RobotRegionDto[];
}

export class RobotTempRegionDto {
  @IsNumber()
  left!: number;

  @IsNumber()
  top!: number;

  @IsNumber()
  right!: number;

  @IsNumber()
  bottom!: number;
}

export class RobotTempRegionCleanDto {
  @IsObject()
  @ValidateNested()
  @Type(() => RobotTempRegionDto)
  temp_region!: RobotTempRegionDto;

  @IsOptional()
  @IsNumber()
  clean_times?: number;
}

export class RobotCallbackDto {
  @IsOptional()
  @IsString()
  deviceSerial?: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
