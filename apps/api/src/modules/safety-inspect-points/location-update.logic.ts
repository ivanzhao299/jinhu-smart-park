export interface LocationUpdateValues {
  buildingId?: string | null;
  floorId?: string | null;
  unitId?: string | null;
}

export function resolveLocationUpdate(
  existing: LocationUpdateValues,
  patch: LocationUpdateValues
): Required<LocationUpdateValues> {
  const buildingCleared = patch.buildingId === null;
  const floorCleared = buildingCleared || patch.floorId === null;

  return {
    buildingId: patch.buildingId === undefined ? existing.buildingId ?? null : patch.buildingId,
    floorId: floorCleared
      ? null
      : patch.floorId === undefined ? existing.floorId ?? null : patch.floorId,
    unitId: floorCleared
      ? null
      : patch.unitId === undefined ? existing.unitId ?? null : patch.unitId
  };
}
