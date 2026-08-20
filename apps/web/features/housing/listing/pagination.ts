export const HOUSING_LIST_PAGE_SIZE = 20;

export function housingTotalPages(total: number, pageSize = HOUSING_LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function housingPageCorrection(
  page: number,
  total: number,
  pageSize = HOUSING_LIST_PAGE_SIZE
): number | null {
  const lastPage = housingTotalPages(total, pageSize);
  return page > lastPage ? lastPage : null;
}
