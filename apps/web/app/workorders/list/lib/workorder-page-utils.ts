import type { DictItemRow, UnitRow, UserRow } from "../types";

export function labelFor(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

export function statusClass(tagType?: string | null): string {
  switch (tagType) {
    case "success":
      return "status-success";
    case "warning":
      return "status-warning";
    case "danger":
      return "status-danger";
    case "primary":
      return "status-primary";
    case "info":
      return "status-info";
    default:
      return "status-muted";
  }
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function displayUserName(user?: UserRow): string {
  if (!user) return "";
  return user.displayName ?? user.realName ?? user.username;
}

export function unitLocation(unit: UnitRow): string {
  return [unit.building?.buildingName, unit.floor?.floorName, unit.unitName].filter(Boolean).join(" / ");
}
