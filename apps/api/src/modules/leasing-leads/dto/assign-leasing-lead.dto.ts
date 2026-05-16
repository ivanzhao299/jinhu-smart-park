import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";

function trimRequired(value: unknown): string {
  return String(value ?? "").trim();
}

export class AssignLeasingLeadDto {
  @Transform(({ obj, value }) => trimRequired(value ?? obj.followUserId))
  @IsUUID()
  follow_user_id!: string;

  @Transform(({ value }) => trimRequired(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
