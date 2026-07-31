export function resolveSubmittedPhotoFileIds(
  requestedPhotoFileIds: string[] | undefined,
  existingPhotoFileIds: string[] | null | undefined
): string[] {
  return [...(requestedPhotoFileIds ?? existingPhotoFileIds ?? [])];
}
