export async function completeAttachmentDeletion<T>(
  deleted: T,
  onDeleted: ((value: T) => void) | undefined,
  refresh: () => Promise<void>
): Promise<void> {
  onDeleted?.(deleted);
  await refresh();
}
