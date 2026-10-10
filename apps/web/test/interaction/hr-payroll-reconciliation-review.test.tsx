import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollReconciliationReview } from "../../app/hr/payroll/PayrollReconciliationReview";
import { hrApi } from "../../lib/hr-api";

vi.mock("../../lib/hr-api", () => ({ hrApi: { payrollReconciliationReviewActions: vi.fn(), reviewPayrollReconciliation: vi.fn() } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-test-token" }));

const reconciliation = {
  id: "run", status: "review", toleranceAmount: "0", employeeCount: 1, differenceCount: 1, engineVersion: "test", createdAt: "2026-10-11T00:00:00.000Z",
  results: [{ resultId: "result", employeeCode: "E-1", employeeName: "员工甲", oldTotal: "1", newTotal: "2", deltaTotal: "1", reviewStatus: "review", differences: [{ id: "difference", resultId: "result", itemName: "基本工资", oldAmount: "1", newAmount: "2", deltaAmount: "1", toleranceAmount: "0", reviewStatus: "review" }] }],
};

describe("payroll reconciliation review workspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(hrApi.payrollReconciliationReviewActions).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
  });
  it("writes an item-targeted controlled draft and keeps the confirmed receipt when readback fails", async () => {
    vi.mocked(hrApi.reviewPayrollReconciliation).mockResolvedValue({ id: "action" } as never);
    const onWritten = vi.fn().mockRejectedValue(new Error("read failed"));
    render(<PayrollReconciliationReview reconciliation={reconciliation} canReview contextKey="scope-a" onWritten={onWritten} />);
    await screen.findByText("尚无复核记录。");
    fireEvent.change(screen.getByLabelText("复核目标"), { target: { value: "item:difference" } });
    fireEvent.change(screen.getByLabelText("复核意见"), { target: { value: " 项目差异待核对 " } });
    fireEvent.click(screen.getByRole("button", { name: "记录复核" }));
    await waitFor(() => expect(hrApi.reviewPayrollReconciliation).toHaveBeenCalledWith("run", { decision: "request_follow_up", comment: "项目差异待核对", itemDifferenceId: "difference" }, "synthetic-test-token", expect.any(String), expect.any(AbortSignal)));
    expect(onWritten).toHaveBeenCalledOnce();
    expect(screen.getByText("复核意见已记录；读取最新详情失败，可单独重试读取。")).toBeInTheDocument();
  });
  it("keeps the terminal run read-only while retaining history", async () => {
    vi.mocked(hrApi.payrollReconciliationReviewActions).mockResolvedValue({ items: [{ id: "action", sequenceNo: 1, decision: "accept_explanation", comment: "已接受", createdAt: "2026-10-11T00:00:00.000Z", resultId: null, itemDifferenceId: null, employeeCode: null, employeeName: null, itemName: null }], total: 1, page: 1, page_size: 20 });
    render(<PayrollReconciliationReview reconciliation={{ ...reconciliation, status: "accepted" }} canReview contextKey="scope-a" onWritten={vi.fn()} />);
    await screen.findByText("已接受");
    expect(screen.queryByRole("button", { name: "记录复核" })).toBeNull();
    expect(screen.getByText("本次模拟已终态，不可追加复核。")).toBeInTheDocument();
  });
  it("uses a synchronous lock and keeps the draft retryable when the write receipt is incomplete", async () => {
    let resolveWrite: (value: unknown) => void = () => undefined;
    vi.mocked(hrApi.reviewPayrollReconciliation).mockImplementation(() => new Promise((resolve) => { resolveWrite = resolve; }) as never);
    render(<PayrollReconciliationReview reconciliation={reconciliation} canReview contextKey="scope-a" onWritten={vi.fn()} />);
    await screen.findByText("尚无复核记录。");
    fireEvent.change(screen.getByLabelText("复核意见"), { target: { value: "保留原意见" } });
    const submit = screen.getByRole("button", { name: "记录复核" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(hrApi.reviewPayrollReconciliation).toHaveBeenCalledOnce();
    resolveWrite({ id: "" });
    await screen.findByText("复核请求结果不完整，可按原意见重试。");
    expect(screen.getByLabelText("复核意见")).toHaveValue("保留原意见");
  });
});
