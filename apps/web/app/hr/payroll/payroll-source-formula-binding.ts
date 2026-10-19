import type { FormalPayrollSourceItem } from "@jinhu/shared";

/**
 * Bind a preserved local source expression only through the explicitly selected
 * numeric versions. This is intentionally route-local: it is source-draft
 * preparation, not a generic cross-domain formula resolver.
 */
export function bindSelectedPayrollSourceReferences(expression: string, selected: readonly FormalPayrollSourceItem[]): string {
  const aliases = new Map<string, { id: string; code: string }>();
  for (const item of selected) {
    if (!item.enabled || item.valueType !== "decimal") throw new Error(`所选项目 ${item.displayName} 不是启用数值项目。`);
    for (const alias of [item.code, item.legacyName, item.displayName]) {
      const key = alias;
      const existing = aliases.get(key);
      if (existing && existing.id !== item.id) throw new Error(`原公式引用“${key}”对应多个所选项目版本，请只保留一个明确版本。`);
      aliases.set(key, { id: item.id, code: item.code });
    }
  }
  return expression.replace(/\[([^\]]+)\]/gu, (whole, raw: string) => {
    const reference = raw.trim();
    if (reference.startsWith("人事系统.")) return whole;
    const bound = aliases.get(reference);
    if (!bound) throw new Error(`原公式引用“${reference}”未对应已选择的启用数值项目。`);
    return `[${bound.code}]`;
  });
}
