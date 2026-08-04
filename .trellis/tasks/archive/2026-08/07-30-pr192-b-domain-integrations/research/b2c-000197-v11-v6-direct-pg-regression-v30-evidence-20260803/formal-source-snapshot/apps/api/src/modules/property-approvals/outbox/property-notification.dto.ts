import { Transform } from "class-transformer";
import {
  IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength
} from "class-validator";
import type { NotificationMarkReadCommand } from "@jinhu/shared";

export class PropertyNotificationListQueryDto {
  @IsOptional() @Transform(({ value }) => Number(value ?? 1))
  @IsInt() @Min(1) page = 1;
  @IsOptional() @Transform(({ value }) => Number(value ?? 20))
  @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsIn(["read", "unread"]) readStatus?: "read" | "unread";
  @IsOptional() @IsIn(["info", "warning", "critical"]) severity?: string;
  @IsOptional() @IsString() @MaxLength(128) notificationType?: string;
  @IsOptional() @IsIn(["createdAt", "readAt"]) sort: "createdAt" | "readAt" = "createdAt";
  @IsOptional() @IsIn(["asc", "desc"]) order: "asc" | "desc" = "desc";
}

export class PropertyNotificationMarkReadDto implements NotificationMarkReadCommand {
  @IsString() @MinLength(1) @MaxLength(128) @Matches(/^[\x20-\x7e]+$/) clientKey!: string;
  @IsInt() @Min(1) expectedReadVersion!: number;
}
