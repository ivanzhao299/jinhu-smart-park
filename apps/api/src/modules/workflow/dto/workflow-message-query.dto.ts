import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class WorkflowMessageQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : undefined))
  @IsIn(["all", "read", "unread"])
  read_status?: "all" | "read" | "unread";

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : undefined))
  @IsString()
  category?: string;
}
