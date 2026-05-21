import { Transform } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { normalizeStringArray, trimOptional } from "./create-work-order.dto";

export const WORK_ORDER_LOG_ACTIONS = [
  "create",
  "update",
  "assign",
  "reassign",
  "accept",
  "start",
  "wait_material",
  "resume",
  "finish",
  "confirm",
  "evaluate",
  "close",
  "cancel",
  "return",
  "reject",
  "overdue",
  "overdue_clear",
  "system"
] as const;

export class WorkOrderLogQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 50))
  @IsInt()
  @Min(1)
  @Max(200)
  page_size = 50;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(["asc", "desc", "ASC", "DESC"])
  order?: string;
}

export class CreateWorkOrderLogDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(WORK_ORDER_LOG_ACTIONS)
  action?: (typeof WORK_ORDER_LOG_ACTIONS)[number];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reason?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @IsUUID("4", { each: true })
  attachment_file_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
