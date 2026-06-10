import type { UserContext } from "@jinhu/shared";
import { maskField } from "../../../../lib/field-policy";
import type { DictItemRow } from "../types";

export const UNIT_FIELD_REF_PRICE = "ref_price";
export const UNIT_FIELD_REMARK = "remark";
export const UNIT_FIELD_PHOTO_URLS = "photo_urls";

const ALLOWED_RENTAL_STATUS_TARGETS = new Map<number, number[]>([
  [10, [20, 50, 60]],
  [20, [10, 30, 50]],
  [30, [40, 50]],
  [40, [30, 10]],
  [50, [10, 60]],
  [60, [10, 50]],
  [70, []]
]);

export function dictLabel(items: DictItemRow[] | undefined, value: number): string {
  return items?.find((item) => Number(item.itemValue) === value)?.itemLabel ?? String(value);
}

export function dictLabelText(items: DictItemRow[] | undefined, value: string | null): string {
  return items?.find((item) => item.itemValue === value)?.itemLabel ?? value ?? "-";
}

export function dictStatusClass(tagType?: string | null): string {
  if (tagType === "success" || tagType === "warning" || tagType === "danger" || tagType === "primary" || tagType === "info") {
    return `status-${tagType}`;
  }
  return "status-muted";
}

export function getTransitionOptions(currentStatus: number, items: DictItemRow[] | undefined, canForceChangeStatus: boolean): DictItemRow[] {
  const allowedValues = new Set(ALLOWED_RENTAL_STATUS_TARGETS.get(currentStatus) ?? []);
  if (currentStatus === 30 && canForceChangeStatus) {
    allowedValues.add(10);
  }
  return (items ?? []).filter((item) => allowedValues.has(Number(item.itemValue)));
}

export function formatArea(value: string): string {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ㎡` : String(value || "-");
}

export function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 元` : String(value);
}

export function maskUnitField(user: UserContext | null, fieldKey: string, value: unknown): unknown {
  return maskField(user, "asset", "unit", fieldKey, value);
}

export function fieldText(value: unknown): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function formatYmd(value: Date): string {
  return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}`;
}
