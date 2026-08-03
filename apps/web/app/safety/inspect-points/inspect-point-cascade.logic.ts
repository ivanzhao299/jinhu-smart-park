export interface LocationSelection {
  buildingId: string;
  floorId: string;
  unitId: string;
}

export interface FloorLocationOption {
  id: string;
  buildingId: string;
}

export interface UnitLocationOption {
  id: string;
  buildingId?: string | null;
  floorId?: string | null;
}

export function floorCandidates<T extends FloorLocationOption>(floors: T[], buildingId: string): T[] {
  if (!buildingId) return [];
  return floors.filter((floor) => floor.buildingId === buildingId);
}

export function unitCandidates<T extends UnitLocationOption>(units: T[], floorId: string): T[] {
  if (!floorId) return [];
  return units.filter((unit) => unit.floorId === floorId);
}

export function reconcileLocationSelection(
  selection: LocationSelection,
  floors: FloorLocationOption[],
  units: UnitLocationOption[]
): LocationSelection {
  const floorId = floorCandidates(floors, selection.buildingId).some((floor) => floor.id === selection.floorId)
    ? selection.floorId
    : "";
  const unitId = unitCandidates(units, floorId).some((unit) => unit.id === selection.unitId) ? selection.unitId : "";
  return { buildingId: selection.buildingId, floorId, unitId };
}

export function changeLocationParent(
  selection: LocationSelection,
  key: "buildingId" | "floorId" | "unitId",
  value: string,
  floors: FloorLocationOption[],
  units: UnitLocationOption[]
): LocationSelection {
  return reconcileLocationSelection({ ...selection, [key]: value }, floors, units);
}
