import { createHash } from "node:crypto";
import {
  PROPERTY_TASK_ID_NAMESPACE,
  propertyTaskIdCanonicalBytes,
  propertyTaskKeyCanonicalBytes
} from "@jinhu/shared";

export function canonicalPropertyTaskRequestHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortCanonical(value)))
    .digest("hex");
}

export function derivePropertyTaskIdentity(input: {
  sourceType: string;
  sourceId: string;
  taskKind: string;
  businessOccurrenceKey: string;
}): { taskKey: string; taskId: string } {
  const taskKey = createHash("sha256")
    .update(propertyTaskKeyCanonicalBytes(input))
    .digest("hex");
  return {
    taskKey,
    taskId: uuidV5(PROPERTY_TASK_ID_NAMESPACE, propertyTaskIdCanonicalBytes(taskKey))
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortCanonical(item)])
    );
  }
  return value;
}

function uuidV5(namespace: string, name: Uint8Array): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const digest = createHash("sha1")
    .update(namespaceBytes)
    .update(name)
    .digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const value = digest.subarray(0, 16).toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
