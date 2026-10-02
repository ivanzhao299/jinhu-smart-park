import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReconciliationSourcePreparation } from "../../app/hr/payroll/ReconciliationSourcePreparation";
import { hrApi, type HrPayrollReconciliationSetup } from "../../lib/hr-api";
vi.mock("../../lib/hr-api", () => ({ hrApi: { previewPayrollReconciliationSource: vi.fn(), createPayrollReconciliationSource: vi.fn() } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-test-token" }));
const setup = { books: [{ id: "book", bookName: "测试账套" }], sourceBatches: [{ id: "batch", recordCount: 93 }], attendanceBatches: [], legacyBatches: [], netItems: [] } as unknown as HrPayrollReconciliationSetup;
const preview = { legacyBatchId: "batch", bookId: "book", periodMonth: "2026-07-01", bindingSha256: "a".repeat(64), sourceSha256: "b".repeat(64), snapshotCount: 93, itemCount: 300, employeeCount: 64 };
function choose() {
  fireEvent.change(screen.getByLabelText("已导入历史来源"), { target: { value: "batch" } });
  fireEvent.change(screen.getByLabelText("工资账套"), { target: { value: "book" } });
  fireEvent.change(screen.getByLabelText("核对月份"), { target: { value: "2026-07" } });
}
describe("historical reconciliation source preparation", () => {
  it("requires preview, reason and confirmation and sends metadata without employee count", async () => {
    vi.mocked(hrApi.previewPayrollReconciliationSource).mockResolvedValue(preview);
    vi.mocked(hrApi.createPayrollReconciliationSource).mockResolvedValue({ ...preview, id: "source" });
    const prepared = vi.fn();
    render(<ReconciliationSourcePreparation setup={setup} onPrepared={prepared} />);
    expect(screen.getByRole("button", { name: "预览来源" })).toBeDisabled();
    choose(); fireEvent.click(screen.getByRole("button", { name: "预览来源" }));
    await screen.findByText("93 条工资记录 · 64 位已关联员工 · 300 项明细");
    const freeze = screen.getByRole("button", { name: "冻结核对来源" }); expect(freeze).toBeDisabled();
    fireEvent.change(screen.getByLabelText("核对说明"), { target: { value: " 核对期间 " } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(freeze); fireEvent.click(freeze);
    await waitFor(() => expect(prepared).toHaveBeenCalledOnce());
    expect(hrApi.createPayrollReconciliationSource).toHaveBeenCalledOnce();
    const { employeeCount, ...metadata } = preview;
    expect(employeeCount).toBe(64);
    expect(hrApi.createPayrollReconciliationSource).toHaveBeenCalledWith({ ...metadata, reason: "核对期间" }, "synthetic-test-token");
    expect(screen.getByRole("status")).toHaveTextContent("来源已冻结");
  });
  it("ignores a pending preview after the month changes", async () => {
    let resolve!: (value: typeof preview) => void;
    vi.mocked(hrApi.previewPayrollReconciliationSource).mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<ReconciliationSourcePreparation setup={setup} onPrepared={vi.fn()} />);
    choose(); fireEvent.click(screen.getByRole("button", { name: "预览来源" }));
    fireEvent.change(screen.getByLabelText("核对月份"), { target: { value: "2026-06" } });
    resolve(preview);
    await waitFor(() => expect(screen.getByRole("button", { name: "预览来源" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "冻结核对来源" })).toBeNull();
  });
  it("clears the preview after a rejected freeze and requires a new inspection", async () => {
    vi.mocked(hrApi.previewPayrollReconciliationSource).mockResolvedValue(preview);
    vi.mocked(hrApi.createPayrollReconciliationSource).mockRejectedValue(new Error("权限已变更，请重新核对"));
    const prepared = vi.fn();
    render(<ReconciliationSourcePreparation setup={setup} onPrepared={prepared} />);
    choose(); fireEvent.click(screen.getByRole("button", { name: "预览来源" }));
    await screen.findByText("93 条工资记录 · 64 位已关联员工 · 300 项明细");
    fireEvent.change(screen.getByLabelText("核对说明"), { target: { value: "核对期间" } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "冻结核对来源" }));
    await screen.findByText("权限已变更，请重新核对");
    expect(screen.queryByText("93 条工资记录 · 64 位已关联员工 · 300 项明细")).toBeNull();
    expect(prepared).not.toHaveBeenCalled();
  });
  it("ignores a completed write after its scope panel has unmounted", async () => {
    vi.mocked(hrApi.previewPayrollReconciliationSource).mockResolvedValue(preview);
    let resolve!: (source: { id: string } & typeof preview) => void;
    vi.mocked(hrApi.createPayrollReconciliationSource).mockReturnValue(new Promise((done) => { resolve = done; }));
    const prepared = vi.fn(), view = render(<ReconciliationSourcePreparation setup={setup} onPrepared={prepared} />);
    choose(); fireEvent.click(screen.getByRole("button", { name: "预览来源" }));
    await screen.findByText("93 条工资记录 · 64 位已关联员工 · 300 项明细");
    fireEvent.change(screen.getByLabelText("核对说明"), { target: { value: "核对期间" } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "冻结核对来源" }));
    view.unmount(); resolve({ ...preview, id: "source" });
    await Promise.resolve(); expect(prepared).not.toHaveBeenCalled();
  });
});
