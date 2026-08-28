import type { UserParkContext } from "@jinhu/shared";

export function formatParkRoleSummary(
  summary: UserParkContext["role_summary"],
  emptyLabel: string
): string | null {
  if (!summary) return null;
  if (!summary.has_business_role) return emptyLabel;
  const visibleNames = summary.role_names.slice(0, 2);
  if (visibleNames.length === 0) return `${summary.role_count} 个角色`;
  return summary.role_count > visibleNames.length
    ? `${visibleNames.join("、")}等 ${summary.role_count} 个角色`
    : visibleNames.join("、");
}
