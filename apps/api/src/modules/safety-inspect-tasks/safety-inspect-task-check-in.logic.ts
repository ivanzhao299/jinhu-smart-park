export function resolveCheckInPhotoFileIds(
  requestedPhotoFileIds: string[] | undefined,
  existingPhotoFileIds: string[] | null | undefined
): string[] {
  return [...(requestedPhotoFileIds ?? existingPhotoFileIds ?? [])];
}
