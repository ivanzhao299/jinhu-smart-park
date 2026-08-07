export const ADMIN_ISSUE_PAGE_SIZE = 20;

export type AdminIssueHistoryView = "mine" | "manage";

export function buildAdminIssueHistoryPath(view: AdminIssueHistoryView, page: number) {
  const endpoint = view === "manage" ? "/admin-issues" : "/admin-issues/mine";
  return `${endpoint}?page=${Math.max(1, Math.trunc(page))}&page_size=${ADMIN_ISSUE_PAGE_SIZE}`;
}

export function adminIssuePageCount(total: number, pageSize = ADMIN_ISSUE_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}
