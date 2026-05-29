import { Transform } from "class-transformer";
import { IsObject, IsOptional } from "class-validator";

function normalizePayload(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export class TestIotRuleDto {
  @IsOptional()
  @IsObject()
  @Transform(({ value }) => normalizePayload(value))
  trigger_payload?: Record<string, unknown>;
}
