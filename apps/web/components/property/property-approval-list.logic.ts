export const PROPERTY_APPROVAL_PAGE_SIZE = 20;

export function propertyApprovalPageFromQuery(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function propertyApprovalListQuery(page: number): string {
  return new URLSearchParams({
    page: String(page),
    pageSize: String(PROPERTY_APPROVAL_PAGE_SIZE)
  }).toString();
}

export function propertyApprovalPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PROPERTY_APPROVAL_PAGE_SIZE));
}
