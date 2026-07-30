export async function completeAttachmentDeletion<T>(
  deleted: T,
  onDeleted: ((value: T) => void) | undefined,
  removeCommitted: (value: T) => void,
  refresh: () => Promise<void>
): Promise<string | null> {
  onDeleted?.(deleted);
  removeCommitted(deleted);
  try {
    await refresh();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "附件列表刷新失败";
  }
}
