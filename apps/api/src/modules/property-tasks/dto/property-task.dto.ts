import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate
} from "class-validator";
import { PROPERTY_TASK_STATUSES } from "@jinhu/shared";
import {
  CanonicalBusinessOccurrenceKeyConstraint,
  CanonicalUtcMillisecondIsoConstraint,
  LowercaseUuidV1ToV5Constraint
} from "../property-task.validation";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class PropertyTaskListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsIn(PROPERTY_TASK_STATUSES)
  assignmentStatus?: (typeof PROPERTY_TASK_STATUSES)[number];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  taskKind?: string;

  @IsOptional()
  @Validate(LowercaseUuidV1ToV5Constraint)
  assigneeId?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  sourceType?: string;

  @IsOptional()
  @IsIn(["updatedAt", "createdAt"])
  sort: "updatedAt" | "createdAt" = "updatedAt";
}

export class PropertyTaskMutationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/)
  clientKey!: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedAssignmentVersion!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedSourceVersion!: number;

  @IsString()
  @IsNotEmpty()
  @Validate(CanonicalBusinessOccurrenceKeyConstraint)
  businessOccurrenceKey!: string;
}

export class PropertyTaskBlockDto extends PropertyTaskMutationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @Validate(CanonicalUtcMillisecondIsoConstraint)
  blockedUntil!: string | null;
}

export class PropertyTaskReleaseDto extends PropertyTaskMutationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class PropertyTaskRebuildDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/)
  clientKey!: string;

  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  sourceType!: string;

  @Validate(LowercaseUuidV1ToV5Constraint)
  sourceId!: string;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedProjectionVersion!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
