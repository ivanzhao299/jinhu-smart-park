import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyApprovalDetailClient } from "@/components/property/PropertyApprovalClient";
import { AuthUserContext } from "@/lib/auth-context";
import type { UserContext } from "@jinhu/shared";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: request, createIdempotencyKey: () => "key" }));
vi.mock("@/lib/authz", () => ({ getAccessToken: () => "token" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
const detail = (id = "a", allowedActions = ["property.approval.withdraw", "property.approval.decide"]) => ({ data: {
  request: { requestId: id, actionId: "housing.leases.void.request", sourceType: "housing-lease", sourceId: "lease",
    decisionStatus: "pending", executionStatus: "not_started", decisionVersion: 1, executionVersion: 1,
    sourceExpectedVersion: 1, amount: null, currency: null, allowedActions },
  stages: [{ stageId: "stage", stageStatus: "pending", version: 1 }]
} });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("approval completion survives refresh failure", () => {
  beforeEach(() => { request.mockReset(); });
  it.each([["撤回", "撤回已完成。"], ["批准", "批准已完成。"], ["驳回", "驳回已完成。"]])("%s keeps receipt and gates stale actions", async (action, receipt) => {
    request.mockResolvedValueOnce(detail()).mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(Error("GET 503"));
    render(<PropertyApprovalDetailClient requestId="a" />);
    await screen.findByRole("button", { name: action });
    fireEvent.change(screen.getByRole("textbox", { name: "原因" }), { target: { value: "有效原因" } });
    fireEvent.click(screen.getByRole("button", { name: action }));
    await screen.findByText(receipt); await screen.findByText("GET 503");
    expect(screen.getByRole("textbox", { name: "原因" })).toHaveValue("");
    for (const label of ["批准", "驳回", "撤回"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: label }));
    }
    expect(request.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
    request.mockResolvedValueOnce(detail("a", []));
    fireEvent.click(screen.getByRole("button", { name: "刷新详情" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "刷新详情" })).not.toBeInTheDocument());
    expect(screen.getByText(receipt)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
  });
  it.each(["撤回", "驳回"])("%s requires reason; failed POST retains it without completion", async (action) => {
    request.mockResolvedValueOnce(detail()).mockRejectedValueOnce(Error("409 approval-already-decided"));
    render(<PropertyApprovalDetailClient requestId="a" />);
    fireEvent.click(await screen.findByRole("button", { name: action }));
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "保留原因" } });
    fireEvent.click(screen.getByRole("button", { name: action }));
    await screen.findByText("409 approval-already-decided");
    expect(screen.getByRole("textbox")).toHaveValue("保留原因");
    expect(screen.queryByText(/已完成/)).not.toBeInTheDocument();
  });
  it("initial GET failure can refresh", async () => {
    request.mockRejectedValueOnce(Error("initial 503")).mockResolvedValueOnce(detail());
    render(<PropertyApprovalDetailClient requestId="a" />);
    fireEvent.click(await screen.findByRole("button", { name: "刷新详情" }));
    expect(await screen.findByRole("button", { name: "撤回" })).toBeEnabled();
  });
  it("request change cannot show old receipt or late old detail", async () => {
    const late = deferred<ReturnType<typeof detail>>();
    request.mockResolvedValueOnce(detail()).mockResolvedValueOnce({ data: {} }).mockReturnValueOnce(late.promise);
    const view = render(<PropertyApprovalDetailClient requestId="a" />);
    fireEvent.click(await screen.findByRole("button", { name: "批准" }));
    await screen.findByText("批准已完成。");
    request.mockResolvedValueOnce(detail("b", []));
    view.rerender(<PropertyApprovalDetailClient requestId="b" />);
    await waitFor(() => expect(request).toHaveBeenCalledWith("/property/approvals/b", expect.anything()));
    await act(async () => late.resolve(detail("a")));
    expect(screen.queryByText("批准已完成。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批准" })).not.toBeInTheDocument();
  });
  it("scope change discards completion", async () => {
    const user = { id: "user", tenant_id: "tenant", park_id: "park", permissions: [] } as unknown as UserContext;
    request.mockResolvedValueOnce(detail()).mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(Error("503"));
    const view = render(<AuthUserContext.Provider value={user}><PropertyApprovalDetailClient requestId="a" /></AuthUserContext.Provider>);
    fireEvent.click(await screen.findByRole("button", { name: "批准" })); await screen.findByText("503");
    request.mockResolvedValueOnce(detail("a", []));
    view.rerender(<AuthUserContext.Provider value={{ ...user, park_id: "other" }}><PropertyApprovalDetailClient requestId="a" /></AuthUserContext.Provider>);
    await waitFor(() => expect(screen.queryByText("批准已完成。")).not.toBeInTheDocument());
  });
});
