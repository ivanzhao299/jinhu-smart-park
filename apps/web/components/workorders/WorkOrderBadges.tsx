import type { DictItemRow } from "./types";

export function WorkOrderStatusBadge({ items, value }: { items: DictItemRow[]; value?: string | null }) {
  return <span className={`status-pill ${statusClass(items, value)}`}>{labelFor(items, value)}</span>;
}

export function PriorityBadge({ items, value }: { items: DictItemRow[]; value?: string | null }) {
  return <span className={`status-pill ${statusClass(items, value)}`}>{labelFor(items, value)}</span>;
}

export function labelFor(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

export function statusClass(items: DictItemRow[], value?: string | null): string {
  const tagType = items.find((item) => item.itemValue === value)?.tagType;
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
