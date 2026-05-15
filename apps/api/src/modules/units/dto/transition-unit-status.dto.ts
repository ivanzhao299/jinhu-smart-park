import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class TransitionUnitStatusDto {
  @Transform(({ value }) => Number(value))
  @IsIn([10, 20, 30, 40, 50, 60])
  after_status!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lock_reason?: string;

  @IsOptional()
  @IsDateString()
  lock_expire_time?: string;
}
