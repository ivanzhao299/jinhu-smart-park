import { Transform } from "class-transformer";
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

const LEASING_LEAD_STATUSES = ["10", "20", "30", "40", "50", "60", "70", "75", "78", "80", "90", "91"] as const;

export class ChangeLeasingLeadStatusDto {
  @Transform(({ value }) => String(value))
  @IsIn(LEASING_LEAD_STATUSES)
  after_status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ValidateIf((dto: ChangeLeasingLeadStatusDto) => dto.after_status === "91")
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  lost_reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lost_remark?: string;
}
