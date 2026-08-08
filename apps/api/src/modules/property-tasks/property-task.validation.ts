import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import {
  PROPERTY_TASK_UUID_PATTERN,
  assertCanonicalPropertyTaskBusinessOccurrenceKey,
  isCanonicalUtcMillisecondIso
} from "@jinhu/shared";
import {
  ValidatorConstraint,
  type ValidatorConstraintInterface
} from "class-validator";

@ValidatorConstraint({ name: "canonicalUtcMillisecondIso", async: false })
export class CanonicalUtcMillisecondIsoConstraint
implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "string" && isCanonicalUtcMillisecondIso(value);
  }

  defaultMessage(): string {
    return "must be a real canonical UTC millisecond timestamp";
  }
}

@ValidatorConstraint({ name: "lowercaseUuidV1ToV5", async: false })
export class LowercaseUuidV1ToV5Constraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "string" && PROPERTY_TASK_UUID_PATTERN.test(value);
  }

  defaultMessage(): string {
    return "must be a lowercase canonical RFC 4122 UUID v1-v5";
  }
}

@ValidatorConstraint({ name: "canonicalBusinessOccurrenceKey", async: false })
export class CanonicalBusinessOccurrenceKeyConstraint
implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== "string") return false;
    try {
      assertCanonicalPropertyTaskBusinessOccurrenceKey(value);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return "must be a canonical business occurrence key of at most 256 UTF-8 bytes";
  }
}

@Injectable()
export class CanonicalUuidPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== "string" || !PROPERTY_TASK_UUID_PATTERN.test(value)) {
      throw new BadRequestException(
        "taskId must be a lowercase canonical RFC 4122 UUID v1-v5"
      );
    }
    return value;
  }
}
