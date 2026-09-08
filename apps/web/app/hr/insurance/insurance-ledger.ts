export const INSURANCE_PAGE_SIZE = 30;
export interface InsuranceLedgerQuery {
  contextKey: string; canRead: boolean; selfOnly: boolean;
  keyword: string; year: string; month: string; reviewOnly: boolean;
}
export function insurancePageCount(total: number) { return Math.max(1, Math.ceil(total / INSURANCE_PAGE_SIZE)); }
export function clampInsurancePage(page: number, total: number) {
  return Math.min(insurancePageCount(total), Math.max(1, Number.isSafeInteger(page) ? page : 1));
}
export function createInsuranceLedger<T extends { id: string }>(api: {
  list(query: InsuranceLedgerQuery, page: number, size: number): Promise<{ items: T[]; total: number; page: number; page_size: number }>;
  detail(id: string): Promise<T>;
  error(error: unknown, fallback: string): string;
}) {
  let query: InsuranceLedgerQuery | null = null, listGeneration = 0, detailGeneration = 0;
  let state = { contextKey: "", rows: [] as T[], total: 0, page: 1, loading: false, detailLoading: false, selected: null as T | null, message: "" };
  const listeners = new Set<() => void>();
  const publish = (next: Partial<typeof state>) => { state = { ...state, ...next }; listeners.forEach(listener => listener()); };
  function invalidate() {
    listGeneration++; detailGeneration++;
    publish({ rows: [], total: 0, page: 1, selected: null, loading: false, detailLoading: false, message: "" });
  }
  function configure(next: InsuranceLedgerQuery) {
    if (JSON.stringify(next) === JSON.stringify(query)) return;
    query = { ...next }; invalidate(); publish({ contextKey: next.contextKey });
  }
  async function load(requestedPage = state.page) {
    if (!query?.canRead) return;
    const page = clampInsurancePage(requestedPage, state.total), requestQuery = query;
    const generation = ++listGeneration;
    detailGeneration++;
    publish({ page, rows: [], loading: true, selected: null, detailLoading: false, message: "" });
    const current = () => generation === listGeneration && query === requestQuery;
    try {
      const result = await api.list(requestQuery, page, INSURANCE_PAGE_SIZE);
      if (!current()) return;
      if (!Number.isSafeInteger(result.total) || result.total < 0 || result.page !== page || result.page_size !== INSURANCE_PAGE_SIZE ||
          !Array.isArray(result.items) || result.items.length > INSURANCE_PAGE_SIZE || new Set(result.items.map(row => row.id)).size !== result.items.length) throw new Error("社保分页响应无效");
      if (page > insurancePageCount(result.total)) { publish({ total: result.total }); await load(insurancePageCount(result.total)); return; }
      publish({ rows: result.items, total: result.total });
    } catch (error) {
      if (current()) publish({ rows: [], message: api.error(error, "加载社保台账失败") });
    } finally { if (current()) publish({ loading: false }); }
  }
  async function pick(row: T) {
    if (!query?.canRead || state.loading || !state.rows.some(item => item.id === row.id)) return;
    const generation = ++detailGeneration, list = listGeneration, requestQuery = query;
    const current = () => generation === detailGeneration && list === listGeneration && query === requestQuery;
    publish({ selected: null, detailLoading: true, message: "" });
    try {
      const detail = await api.detail(row.id);
      if (current()) {
        if (detail.id !== row.id) throw new Error("社保明细响应无效");
        publish({ selected: detail });
      }
    } catch (error) { if (current()) publish({ selected: null, message: api.error(error, "加载社保明细失败") }); }
    finally { if (current()) publish({ detailLoading: false }); }
  }
  return { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    configure, invalidate, load, pick, cancel: () => { listGeneration++; detailGeneration++; } };
}
