export function resolveSubmittedPhotoFileIds(
  requestedPhotoFileIds: string[] | undefined,
  existingPhotoFileIds: string[] | null | undefined
): string[] {
  return [...(requestedPhotoFileIds ?? existingPhotoFileIds ?? [])];
}

export function resolveSubmittedOptionalValue<T>(
  requestedValue: T | null | undefined,
  existingValue: T | null | undefined
): T | null {
  return requestedValue === undefined ? existingValue ?? null : requestedValue;
}
