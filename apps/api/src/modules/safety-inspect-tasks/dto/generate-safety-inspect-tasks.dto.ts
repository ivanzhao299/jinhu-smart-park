import { Transform } from "class-transformer";
import { IsDateString, IsOptional } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export class GenerateSafetyInspectTasksDto {
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  plan_time?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  due_time?: string;
}
