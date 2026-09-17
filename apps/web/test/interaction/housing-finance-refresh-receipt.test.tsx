import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserContext } from "@jinhu/shared";
import { AuthUserContext } from "@/lib/auth-context";
import { HousingFinanceClient } from "@/app/housing/_components/HousingCostSurfaceClients";
const { request, params, router } = vi.hoisted(() => ({ request: vi.fn(), params: new URLSearchParams(), router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("@/lib/api-client", async (original) => ({ ...await original<object>(), apiRequest: request, createIdempotencyKey: () => "key" }));
vi.mock("@/lib/authz", () => ({ getAccessToken: () => "token" }));
vi.mock("@/lib/dict-client", () => ({ loadDictMapByCodes: async () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));
const user = { id: "user", tenant_id: "tenant", park_id: "park", permissions: ["*"], enabled_modules: ["asset", "housing_rental"].map(module_code => ({ module_code, enabled: true })) } as UserContext;
const item = { lease: { id: "lease", leaseCode: "LEASE-740", tenantDisplayName: "租客" }, summary: { receivable: "100", paid: "0", outstanding: "100", deposit_balance: "0" }, receivables: [{ id: "receivable", entryKind: "payment", balance: "100", status: "pending", chargeType: "rent", dueDate: "2026-09-14" }] };
const list = (items = [item]) => ({ data: { items, total: items.length, page: 1, page_size: 20 } });
function view(scope = user) { return <AuthUserContext.Provider value={scope}><HousingFinanceClient /></AuthUserContext.Provider>; }
async function submit() {
  const summary = (await screen.findAllByText("登记财务流水"))[0]!;
  fireEvent.click(summary);
  const form = within(summary.closest("details")!);
  fireEvent.change(form.getByLabelText("目标应收"), { target: { value: "receivable" } });
  for (const [label, value] of [["费用类型", "rent"], ["金额", "10"], ["登记原因", "保留输入"]] as const) fireEvent.change(form.getByLabelText(label), { target: { value } });
  fireEvent.submit(form.getByRole("button", { name: "确认登记" }).closest("form")!);
}
describe("housing finance persistent completion", () => {
  beforeEach(() => { request.mockReset(); });
  it("keeps receipt outside cached rows, removes stale actions and restores only after successful refresh", async () => {
    request.mockResolvedValueOnce(list()).mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(Error("GET 503"));
    render(view()); await submit();
    expect(await screen.findByText("LEASE-740：普通财务流水已登记。")).toHaveTextContent("LEASE-740：普通财务流水已登记。");
    await screen.findByText("数据加载失败，请稍后重试");
    expect(screen.queryAllByText("登记财务流水")).toHaveLength(0);
    expect(request.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
    request.mockResolvedValueOnce(list()); fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await screen.findAllByText("登记财务流水"); expect(screen.getByText("LEASE-740：普通财务流水已登记。")).toHaveTextContent("LEASE-740");
  });
  it("receipt survives removal of the completed row", async () => {
    request.mockResolvedValueOnce(list()).mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce(list([]));
    render(view()); await submit();
    await waitFor(() => expect(screen.queryAllByText("登记财务流水")).toHaveLength(0));
    expect(screen.getByText("LEASE-740：普通财务流水已登记。")).toHaveTextContent("LEASE-740：普通财务流水已登记。");
  });
  it("failed POST preserves input without completion", async () => {
    request.mockResolvedValueOnce(list()).mockRejectedValueOnce(Error("POST 409"));
    render(view()); await submit(); await screen.findByText("财务登记失败，请稍后重试");
    expect(screen.getAllByLabelText("登记原因")[0]).toHaveValue("保留输入");
    expect(screen.queryByText("LEASE-740：普通财务流水已登记。")).not.toBeInTheDocument(); expect(request).toHaveBeenCalledTimes(2);
  });
  it("scope change clears receipt", async () => {
    request.mockResolvedValueOnce(list()).mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(Error("GET 503"));
    const rendered = render(view()); await submit(); await screen.findByText("数据加载失败，请稍后重试");
    request.mockResolvedValueOnce(list([])); rendered.rerender(view({ ...user, park_id: "other" }));
    await waitFor(() => expect(screen.queryByText("LEASE-740：普通财务流水已登记。")).not.toBeInTheDocument());
  });
});
