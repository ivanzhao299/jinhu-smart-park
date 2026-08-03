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
