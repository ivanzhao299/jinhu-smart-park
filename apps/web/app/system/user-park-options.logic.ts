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
  return /[^\p{N}\s]/u.test(value);
}

export function resolveUserParkLabel({ parkName, tenantName }: UserParkLabelSource): string {
  const normalizedParkName = parkName?.trim() ?? "";
  if (isReadableParkName(normalizedParkName)) return normalizedParkName;

  const normalizedTenantName = tenantName?.trim() ?? "";
  return isReadableParkName(normalizedTenantName) ? `${normalizedTenantName}默认园区` : "默认园区";
}

export function resolveUserParkLabels(
  options: UserParkLabelOption[],
  tenantName?: string | null
): Map<string, string> {
  const baseLabels = options.map((option) => resolveUserParkLabel({ parkName: option.parkName, tenantName }));
  const labelCounts = new Map<string, number>();
  baseLabels.forEach((label) => labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1));

  return new Map(options.map((option, index) => {
    const label = baseLabels[index]!;
    const displayLabel = labelCounts.get(label)! > 1 ? `${label}（${option.parkCode.trim()}）` : label;
    return [option.parkId, displayLabel];
  }));
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
