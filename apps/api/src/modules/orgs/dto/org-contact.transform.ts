export function trimOrgContactValue({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}
