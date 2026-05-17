import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class EffectiveLeasingCheckoutDto {
  @IsDateString()
  actual_checkout_date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  opinion?: string;
}
