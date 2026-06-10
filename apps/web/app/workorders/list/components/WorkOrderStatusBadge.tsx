import type { DictItemRow } from "../types";
import { statusClass } from "../lib/workorder-page-utils";

interface WorkOrderStatusBadgeProps {
  items: DictItemRow[];
  value?: string | null;
}

export function WorkOrderStatusBadge({ items, value }: WorkOrderStatusBadgeProps) {
  const item = items.find((candidate) => candidate.itemValue === value);
  return <span className={`status-pill ${statusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}
