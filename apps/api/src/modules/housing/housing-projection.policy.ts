export function maskHousingCredential(
  credential: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(credential).map(([key, value]) => {
    if (typeof value !== "string") return [key, value];
    if (value.length <= 4) return [key, "****"];
    return [key, `${value.slice(0, 2)}***${value.slice(-2)}`];
  }));
}
