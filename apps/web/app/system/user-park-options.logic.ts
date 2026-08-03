export interface UserParkOptionSource {
  tenantId: string;
  defaultParkId: string | null;
  parkIds: string[];
}

export interface UserParkSelectionSource {
  tenantId: string;
  parkId: string;
  accessibleParkIds: string[];
}

export interface UserParkSelection {
  parkId: string;
  accessibleParkIds: string[];
}

export interface UserParkLabelSource {
  parkName?: string | null;
  tenantName?: string | null;
}

export interface UserParkLabelOption extends UserParkLabelSource {
  parkId: string;
  parkCode: string;
}

function isReadableParkName(value: string): boolean {
  return /\p{L}/u.test(value);
}

function normalizeRenderedLabel(value: string): string {
  return value.replace(/\p{Cf}/gu, "").normalize("NFC").trim().replace(/\s+/gu, " ");
}

function formatParkCodeForLabel(value: string): string {
  return [...value.trim()].map((character) => {
    if (character === "\\") return "\\\\";
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0x21 && codePoint <= 0x7E) return character;
    return `\\u{${codePoint.toString(16).toUpperCase()}}`;
  }).join("");
}

export function resolveUserParkLabel({ parkName, tenantName }: UserParkLabelSource): string {
  const normalizedParkName = normalizeRenderedLabel(parkName ?? "");
  if (isReadableParkName(normalizedParkName)) return normalizedParkName;

  const normalizedTenantName = normalizeRenderedLabel(tenantName ?? "");
  return isReadableParkName(normalizedTenantName) ? `${normalizedTenantName}默认园区` : "默认园区";
}

export function resolveUserParkLabels(
  options: UserParkLabelOption[],
  tenantName?: string | null
): Map<string, string> {
  let displayLabels = options.map((option) => resolveUserParkLabel({ parkName: option.parkName, tenantName }));

  for (let pass = 0; pass <= options.length; pass += 1) {
    displayLabels = displayLabels.map(normalizeRenderedLabel);
    const labelCounts = new Map<string, number>();
    displayLabels.forEach((label) => labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1));
    const collidingLabels = new Set(
      [...labelCounts.entries()].filter(([, count]) => count > 1).map(([label]) => label)
    );

    if (collidingLabels.size === 0) {
      return new Map(options.map((option, index) => [option.parkId, displayLabels[index]!]));
    }

    displayLabels = displayLabels.map((label, index) => (
      collidingLabels.has(label) ? `${label}（${formatParkCodeForLabel(options[index]!.parkCode)}）` : label
    ));
  }

  throw new Error("Unable to resolve unique park labels: park codes must be unique");
}

export function resolveUserParkSelection(
  options: UserParkOptionSource,
  existing?: UserParkSelectionSource | null
): UserParkSelection | null {
  const parkIds = [...new Set(options.parkIds.filter(Boolean))];
  if (parkIds.length === 0) return null;

  const existingBelongsToTenant = existing?.tenantId === options.tenantId;
  const requestedParkId = existingBelongsToTenant ? existing.parkId : options.defaultParkId;
  const fallbackParkId = parkIds[0]!;
  const parkId = requestedParkId && parkIds.includes(requestedParkId) ? requestedParkId : fallbackParkId;
  const existingAccessible = existingBelongsToTenant
    ? existing.accessibleParkIds.filter((id) => parkIds.includes(id))
    : parkIds;

  return {
    parkId,
    accessibleParkIds: [...new Set([parkId, ...existingAccessible])]
  };
}
