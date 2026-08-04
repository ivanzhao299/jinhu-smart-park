import { createHash } from "node:crypto";

export function canonicalPropertyEventJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalPropertyEventJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalPropertyEventJson(record[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new TypeError("property event payload contains a non-JSON value");
  }
  return encoded;
}

export function hashCanonicalPropertyEvent(value: unknown): string {
  return createHash("sha256").update(canonicalPropertyEventJson(value)).digest("hex");
}
