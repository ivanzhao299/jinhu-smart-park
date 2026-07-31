export interface FloorLayoutProjection {
  id: string;
  layoutFileId: string | null;
  layoutUrl: string | null;
}

export function clearCommittedFloorLayout<T extends FloorLayoutProjection>(
  floor: T,
  floorId: string,
  deletedFileId: string
): T {
  if (
    floor.id !== floorId
    || floor.layoutFileId !== deletedFileId
  ) {
    return floor;
  }

  return {
    ...floor,
    layoutFileId: null,
    layoutUrl: null
  };
}
