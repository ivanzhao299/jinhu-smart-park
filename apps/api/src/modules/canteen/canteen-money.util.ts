/**
 * 金额工具：库内 numeric(12,2) 一律以“元字符串”落库；
 * 计算统一转“分”(integer) 避免浮点误差，再格式化回两位小数字符串。
 */

/** 元字符串/数字 → 分（整数）。 */
export function yuanToCents(amount: string | number): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) throw new Error(`invalid amount: ${amount}`);
  return Math.round(n * 100);
}

/** 分（整数）→ 元字符串（两位小数）。 */
export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 元字符串相加，结果元字符串。 */
export function addYuan(...amounts: Array<string | number>): string {
  const total = amounts.reduce<number>((acc, cur) => acc + yuanToCents(cur), 0);
  return centsToYuan(total);
}

/** 单价(元) × 数量 → 小计(元字符串)。 */
export function multiplyYuan(price: string | number, qty: number): string {
  return centsToYuan(yuanToCents(price) * qty);
}
