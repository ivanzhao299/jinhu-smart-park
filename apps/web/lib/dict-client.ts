import type { PaginatedResult } from "@jinhu/shared";
import { apiRequest } from "./api-client";
import { getAccessToken } from "./authz";

export interface DictClientItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType?: string | null;
}

export type DictClientMap<T extends DictClientItemRow = DictClientItemRow> = Record<string, T[]>;

export async function loadDictMapByCodes<T extends DictClientItemRow = DictClientItemRow>(
  codes: readonly string[]
): Promise<DictClientMap<T>> {
  const entries = await Promise.all(codes.map(async (code) => {
    const params = new URLSearchParams({
      page: "1",
      page_size: "100",
      status: "enabled",
      dict_code: code
    });
    const response = await apiRequest<PaginatedResult<T>>(`/dict-items?${params.toString()}`, {
      token: getAccessToken()
    });
    return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
  }));
  return Object.fromEntries(entries);
}
