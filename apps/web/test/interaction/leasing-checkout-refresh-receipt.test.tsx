import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserContext } from "@jinhu/shared";
import { AuthUserContext } from "@/lib/auth-context";
import LeasingCheckoutsPage from "@/app/leasing/checkouts/page";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/api-client", async (original) => ({ ...await original<object>(), apiRequest: request, createIdempotencyKey: () => "key" }));
vi.mock("@/lib/authz", () => ({ getAccessToken: () => "token" }));
vi.mock("@/lib/dict-client", () => ({ loadDictMapByCodes: async () => ({}) }));
vi.mock("@/lib/reference-data", () => ({ fetchReferenceFormOptions: async () => ({ parkTenants: [] }) }));
vi.mock("@/components/files/FileUploader", () => ({ FileUploader: () => null }));
const user = { id: "user", tenant_id: "tenant", park_id: "park", permissions: ["leasing_checkout:read", "leasing_checkout:create", "leasing_checkout:update", "leasing_checkout:confirm_settlement", "leasing_checkout:effective"], enabled_modules: [{ module_code: "leasing", enabled: true }] } as UserContext;
function row(status = "40") { return { id: "checkout", checkoutCode: "CHECKOUT-740", contractId: "contract", parkTenantId: "tenant", status, settlementStatus: "30", checkoutType: "normal", plannedCheckoutDate: "2026-09-14", releaseUnitStatus: "rentable", reason: "退租", approveRecords: [] }; }
function list(status = "40") { return { data: { items: [row(status)], total: 1, page: 1, page_size: 20 } }; }
function deferred() { let resolve!: (value: ReturnType<typeof list>) => void; let reject!: (error: Error) => void; const promise = new Promise<ReturnType<typeof list>>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function view(scope = user) { return <AuthUserContext.Provider value={scope}><LeasingCheckoutsPage /></AuthUserContext.Provider>; }
async function open(action: string) {
  fireEvent.click((await screen.findAllByRole("button", { name: "查看" }))[0]!);
  fireEvent.click(screen.getByRole("button", { name: action === "effective" ? "退租生效" : "确认结算" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: action === "effective" ? "确认退租生效" : "确认退租结算" })).getByRole("button", { name: action === "effective" ? "确认退租生效" : "确认结算" }));
}
describe("leasing checkout persistent completion", () => {
  beforeEach(() => { request.mockReset(); });
  it.each(["confirm-settlement", "effective"])("%s keeps completion after GET failure and disables stale actions", async action => {
    let posted = false;
    request.mockImplementation(async (path, options) => {
      if (options.method === "POST") { posted = true; return { data: action === "effective" ? { checkout: row("70"), contract: { status: "80" }, released_units: [], canceled_receivables: [], skipped_receivables: [] } : row("60") }; }
      if (path.startsWith("/leasing/contracts")) return { data: { items: [] } };
      if (posted) throw Error("GET 503"); return list(action === "effective" ? "60" : "40");
    });
    render(view()); await open(action);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("刷新失败"));
    // Completion is published before the confirmation component finishes closing.
    // Wait for that lifecycle boundary before querying same-named page actions.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: action === "effective" ? "确认退租生效" : "确认退租结算" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(action === "effective" ? "退租已生效" : "退租结算已确认");
    for (const name of ["确认结算", "退租生效"]) expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(request.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });
  it.each(["lookup-first", "list-first"])("effective waits for both refreshes: %s", async order => {
    let posted = false; const pendingList = deferred(); const pendingLookup = deferred();
    request.mockImplementation(async (path, options) => {
      if (options.method === "POST") { posted = true; return { data: { checkout: row("70"), contract: { status: "80" }, released_units: [], canceled_receivables: [], skipped_receivables: [] } }; }
      if (path.startsWith("/leasing/contracts")) return posted ? pendingLookup.promise : { data: { items: [] } };
      return posted ? pendingList.promise : list("60");
    });
    render(view()); await open("effective");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("退租已生效"));
    await act(async () => { if (order === "lookup-first") pendingLookup.reject(Error("lookup 503")); else pendingList.reject(Error("list 503")); });
    expect(within(screen.getByRole("dialog", { name: "确认退租生效" })).getByRole("button", { name: "正在提交…" })).toBeDisabled();
    await act(async () => { if (order === "lookup-first") pendingList.reject(Error("list 503")); else pendingLookup.resolve(list()); });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("页面刷新失败"));
  });
  it.each(["confirm-settlement", "effective"])("%s POST failure leaves dialog without completion", async action => {
    request.mockImplementation(async (path, options) => {
      if (options.method === "POST") throw Error("POST 409");
      return path.startsWith("/leasing/contracts") ? { data: { items: [] } } : list(action === "effective" ? "60" : "40");
    });
    render(view()); await open(action); await screen.findByRole("alert");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: action === "effective" ? "确认退租生效" : "确认退租结算" })).toBeInTheDocument();
  });
  it.each(["confirm-settlement", "effective"])("%s preserves completion after successful refresh and scope replacement", async action => {
    let posted = false;
    request.mockImplementation(async (path, options) => {
      if (options.method === "POST") {
        posted = true;
        return { data: action === "effective" ? { checkout: row("70"), contract: { status: "80" }, released_units: [], canceled_receivables: [], skipped_receivables: [] } : row("60") };
      }
      return path.startsWith("/leasing/contracts") ? { data: { items: [] } } : list(posted ? "70" : action === "effective" ? "60" : "40");
    });
    const rendered = render(view()); await open(action);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: action === "effective" ? "确认退租生效" : "确认退租结算" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(action === "effective" ? "退租已生效，合同已终止并释放房源" : "退租结算已确认");
    expect(screen.getByRole("status")).not.toHaveTextContent("刷新失败");
    expect(screen.getByRole("button", { name: "退租生效" })).toBeDisabled();
    rendered.rerender(view({ ...user, park_id: "other" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it.each(["B-refresh", "create-refresh", "late-B", "late-create", "late-close-reopen-A", "same-A", "scope"])(
    "completion refresh respects the selected lifecycle: %s", async scenario => {
      let posted = false;
      let hold = false;
      const pending = deferred();
      const second = { ...row("10"), id: "second", checkoutCode: "SECOND-740", reason: "B draft" };
      const twoRows = () => ({ data: { items: [row(posted ? "60" : "40"), second], total: 2, page: 1, page_size: 20 } });
      request.mockImplementation(async (path, options) => {
        if (options.method === "POST") { posted = true; return { data: row("60") }; }
        if (path.startsWith("/leasing/contracts")) return { data: { items: [] } };
        return hold ? pending.promise : twoRows();
      });
      const rendered = render(view());
      await open("confirm-settlement");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "确认退租结算" })).not.toBeInTheDocument());
      const choose = (code: string) => {
        let record = screen.getAllByText(code)[0]!.parentElement!;
        while (!record.querySelector("button")) record = record.parentElement!;
        fireEvent.click(within(record).getByRole("button", { name: "查看" }));
      };
      const selectNext = () => {
        fireEvent.click(screen.getByRole("button", { name: "取消" }));
        if (scenario.includes("create")) fireEvent.click(screen.getByRole("button", { name: /发起退租/ }));
        else choose(scenario === "late-close-reopen-A" ? "CHECKOUT-740" : "SECOND-740");
        fireEvent.change(screen.getByLabelText("退租原因"), { target: { value: "current draft" } });
      };
      if (scenario === "B-refresh" || scenario === "create-refresh") selectNext();
      hold = true;
      fireEvent.click(screen.getByRole("button", { name: "刷新" }));
      if (scenario.startsWith("late-")) selectNext();
      if (scenario === "scope") {
        hold = false;
        rendered.rerender(view({ ...user, park_id: "other" }));
        await screen.findAllByRole("button", { name: "查看" });
        choose("SECOND-740");
      }
      // Return a different A snapshot so an obsolete refresh cannot pass unnoticed.
      await act(async () => { pending.resolve({ data: { ...twoRows().data, items: [{ ...row("70"), checkoutCode: "A-REFRESHED" }, second] } }); });
      await waitFor(() => expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled());
      const expected = scenario.includes("create") ? "发起退租申请"
        : scenario === "same-A" ? "退租单 A-REFRESHED"
        : scenario === "late-close-reopen-A" ? "退租单 CHECKOUT-740" : "退租单 SECOND-740";
      expect(screen.getByRole("heading", { name: expected })).toBeInTheDocument();
      if (scenario !== "same-A" && scenario !== "scope") expect(screen.getByLabelText("退租原因")).toHaveValue("current draft");
      if (scenario.includes("create")) expect(screen.getByLabelText("退租单号")).toBeEnabled();
      else if (expected.includes("SECOND")) expect(screen.getByLabelText("退租单号")).toHaveValue("SECOND-740");
      if (scenario === "same-A") expect(screen.getByRole("button", { name: "退租生效" })).toBeDisabled();
      if (scenario === "scope") expect(screen.queryByRole("status")).not.toBeInTheDocument();
      else expect(screen.getByRole("status")).toHaveTextContent("退租结算已确认");
      const writes = request.mock.calls.filter(([, options]) => options.method === "POST");
      expect(writes).toHaveLength(1);
      expect(writes[0]).toEqual(["/leasing/checkouts/checkout/confirm-settlement", expect.objectContaining({
        body: { deduction_amount: "0", additional_charge_amount: "0", settlement_remark: undefined }
      })]);
    }
  );

});
