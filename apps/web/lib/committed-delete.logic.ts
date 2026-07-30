import type { PaginatedResult } from "@jinhu/shared";

export function removeCommittedItem<T extends { id: string }>(
  page: PaginatedResult<T>,
  deletedId: string
): PaginatedResult<T> {
  const items = page.items.filter((item) => item.id !== deletedId);
  if (items.length === page.items.length) return page;
  return {
    ...page,
    items,
    total: Math.max(0, page.total - 1)
  };
}

export async function getCommittedDeleteRefreshError(
  refresh: () => Promise<void>
): Promise<string | null> {
  try {
    await refresh();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "列表刷新失败";
  }
}
