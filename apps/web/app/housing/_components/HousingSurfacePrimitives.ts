import { HOUSING_LEASE_STATUS_LABELS } from "@jinhu/shared";
import type { PropertyFieldDescriptor } from "../../../features/property-shared";

export const housingLeaseStatusOptions = Object.entries(HOUSING_LEASE_STATUS_LABELS)
  .map(([value, label]) => ({ label, value }));

export const housingOrderFilter = {
  key: "order", label: "排序方向", options: [
    { label: "升序", value: "asc" }, { label: "降序", value: "desc" }
  ]
} as const;

export function housingSortFilter(options: readonly { label: string; value: string }[]) {
  return { key: "sort", label: "排序字段", options };
}

export function displayHousingValue(value: string | null | undefined): string {
  return value?.trim() || "—";
}
export function housingMoney(value: string | null | undefined): string {
  return value === undefined || value === null ? "受权限保护" : `¥${value}`;
}
export function housingDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}
export function housingFields<T>(...values: PropertyFieldDescriptor<T>[]) {
  return values as readonly PropertyFieldDescriptor<T>[];
}
