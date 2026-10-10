export const CONTRACT_PAGE_SIZE = 50;
const CONTRACT_CALENDAR_DATE = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/;
const LEGACY_JS_CALENDAR_DATE = /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})(?:\s|$)/;
const MONTH_NUMBER: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/**
 * Contract date columns are calendar facts. Preserve the original calendar part
 * instead of converting an instant through a browser or business timezone.
 */
export function formatContractCalendarDate(value: string | null | undefined, absent = "未登记") {
  if (value == null || value.trim() === "") return absent;
  const source = value.trim();
  const dateOnly = CONTRACT_CALENDAR_DATE.exec(source);
  if (dateOnly) return dateOnly[1]!;
  const legacy = LEGACY_JS_CALENDAR_DATE.exec(source);
  if (!legacy) return source;
  return `${legacy[3]}-${MONTH_NUMBER[legacy[1]!]!}-${legacy[2]!.padStart(2, "0")}`;
}

/** Mutations may finish after navigation; never refresh or publish for an old identity. */
export async function runContractContextAction<T>(input: {
  isCurrent(): boolean; work(): Promise<T>; refresh(): Promise<void>;
  success(result: T): void; error(error: unknown): void; settled(): void;
}) {
  if (!input.isCurrent()) return;
  try {
    const result = await input.work();
    if (!input.isCurrent()) return;
    await input.refresh();
    if (input.isCurrent()) input.success(result);
  } catch (error) { if (input.isCurrent()) input.error(error); }
  finally { if (input.isCurrent()) input.settled(); }
}
export interface ContractLedgerQuery { contextKey: string; canRead: boolean; canManage: boolean; selfOnly: boolean; keyword: string; status: string }
export const contractPageCount = (total: number) => Math.max(1, Math.ceil(total / CONTRACT_PAGE_SIZE));
export const clampContractPage = (page: number, total: number) => Math.max(1, Math.min(contractPageCount(total), Number.isSafeInteger(page) ? page : 1));
export function createContractLedger<T extends { id: string }, D extends T>(api: {
  list(query: ContractLedgerQuery, page: number, size: number): Promise<{ items: T[]; total: number; page: number; page_size: number }>;
  activeTotal(query: ContractLedgerQuery): Promise<number>;
  detail(id: string): Promise<D>;
  error(error: unknown, fallback: string): string;
}) {
  let query: ContractLedgerQuery | null = null, listGeneration = 0, detailGeneration = 0, interaction = 0;
  let state = { contextKey: "", rows: [] as T[], total: 0, activeTotal: 0, page: 1, loading: false, detailLoading: false, saving: false, selected: null as D | null, receipt: null as { result: unknown; label: string; refreshFailed: boolean } | null, message: "" };
  const listeners = new Set<() => void>();
  const publish = (next: Partial<typeof state>) => { state = { ...state, ...next }; listeners.forEach(listener => listener()); };
  const cancel = () => { listGeneration++; detailGeneration++; interaction++; };
  function invalidate() { cancel(); publish({ rows: [], total: 0, activeTotal: 0, page: 1, loading: false, detailLoading: false, saving: false, selected: null, receipt: null, message: "" }); }
  function configure(next: ContractLedgerQuery) {
    if (JSON.stringify(next) === JSON.stringify(query)) return;
    query = { ...next }; invalidate(); publish({ contextKey: next.contextKey });
  }
  async function loadPage(requested = state.page, internal = false): Promise<boolean> {
    if (!query?.canRead) return false;
    if (!internal) { interaction++; publish({ saving: false }); }
    const page = clampContractPage(requested, state.total), requestQuery = query, generation = ++listGeneration;
    detailGeneration++;
    const current = () => generation === listGeneration && query === requestQuery;
    publish({ page, rows: [], selected: null, loading: true, detailLoading: false, message: "" });
    try {
      const [result, activeTotal] = await Promise.all([api.list(requestQuery, page, CONTRACT_PAGE_SIZE), api.activeTotal(requestQuery)]);
      if (!current()) return false;
      if (!Number.isSafeInteger(result.total) || result.total < 0 || !Number.isSafeInteger(activeTotal) || activeTotal < 0 ||
          result.page !== page || result.page_size !== CONTRACT_PAGE_SIZE || !Array.isArray(result.items) || result.items.length > CONTRACT_PAGE_SIZE ||
          new Set(result.items.map(row => row.id)).size !== result.items.length) throw new Error("合同分页响应无效");
      if (page > contractPageCount(result.total)) { publish({ total: result.total }); return await loadPage(contractPageCount(result.total), internal); }
      publish({ rows: result.items, total: result.total, activeTotal, receipt: state.receipt ? { ...state.receipt, refreshFailed: false } : null }); return true;
    } catch (error) { if (current()) publish({ rows: [], message: api.error(error, "加载劳动合同失败") }); return false; }
    finally { if (current()) publish({ loading: false }); }
  }
  async function select(id: string, internal = false): Promise<boolean> {
    if (!query?.canRead || (!internal && (state.loading || !state.rows.some(row => row.id === id)))) return false;
    if (!internal) { interaction++; publish({ saving: false, receipt: null }); }
    const generation = ++detailGeneration, list = listGeneration, requestQuery = query;
    const current = () => generation === detailGeneration && list === listGeneration && query === requestQuery;
    publish({ selected: null, detailLoading: true, message: "" });
    try {
      const detail = await api.detail(id);
      if (!current()) return false;
      if (detail.id !== id) throw new Error("合同详情响应无效");
      publish({ selected: detail }); return true;
    } catch (error) { if (current()) publish({ selected: null, message: api.error(error, "加载合同详情失败") }); return false; }
    finally { if (current()) publish({ detailLoading: false }); }
  }
  async function mutate(work: () => Promise<unknown>, options: { selectedId?: string; refreshList: boolean; success: string; failure: string; receipt?: (result: unknown) => string; onSuccess?: () => void }) {
    if (state.saving || !query?.canManage) return;
    const requestQuery = query, owner = interaction;
    const current = () => query === requestQuery && interaction === owner;
    publish({ saving: true, message: "" });
    try {
      const result = await work();
      if (!current()) return;
      const receipt = { result, label: options.receipt?.(result) ?? options.success, refreshFailed: false };
      publish({ receipt });
      options.onSuccess?.();
      let refreshFailed = false;
      if (options.refreshList && !await loadPage(state.page, true)) refreshFailed = true;
      if (!current()) return;
      if (!refreshFailed && options.selectedId && !await select(options.selectedId, true)) refreshFailed = true;
      if (current()) publish({ receipt: { ...receipt, refreshFailed }, message: refreshFailed ? `${options.success} 已提交；刷新读取失败，请使用“刷新本页”重试读取。` : options.success });
    } catch (error) { if (current()) publish({ message: api.error(error, options.failure) }); }
    finally { if (current()) publish({ saving: false }); }
  }
  return { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    configure, invalidate, cancel, load: (page?: number) => loadPage(page), pick: (row: T) => select(row.id), mutate,
    setMessage: (message: string) => publish({ message }) };
}
