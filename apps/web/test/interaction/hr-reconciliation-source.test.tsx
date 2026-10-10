import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { ReconciliationSourcePreparation } from "../../app/hr/payroll/ReconciliationSourcePreparation";
import { hrApi, type HrPayrollReconciliationSetup } from "../../lib/hr-api";
vi.mock("../../lib/hr-api", () => ({ hrApi: { previewPayrollReconciliationSource: vi.fn(), createPayrollReconciliationSource: vi.fn(), payrollReconciliationSourcePeriods: vi.fn().mockResolvedValue({items:[],total:0,page:1,pageSize:50}) } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-test-token" }));
const auth = vi.hoisted(() => ({ user: { id: "operator", tenant_id: "tenant", park_id: "park", permissions: ["hr:payroll_reconciliation:review"] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => auth.user }));
const setup = { books: [{ id: "book", bookName: "测试账套" }], sourceBatches: [{ id: "batch", recordCount: 93 }], attendanceBatches: [], legacyBatches: [], netItems: [] } as unknown as HrPayrollReconciliationSetup;
const preview = { legacyBatchId: "batch", bookId: "book", periodMonth: "2026-07-01", bindingSha256: "a".repeat(64), sourceSha256: "b".repeat(64), snapshotCount: 93, itemCount: 300, employeeCount: 64 };
function choose() {
  fireEvent.change(screen.getByLabelText("已导入来源"), { target: { value: "batch" } });
  fireEvent.change(screen.getByLabelText("工资账套"), { target: { value: "book" } });
  fireEvent.change(screen.getByLabelText("核对月份"), { target: { value: "2026-07" } });
}
describe("historical reconciliation source preparation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.user={id:"operator",tenant_id:"tenant",park_id:"park",permissions:["hr:payroll_reconciliation:review"]};
    vi.mocked(hrApi.payrollReconciliationSourcePeriods).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
  });
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
  it("keeps the discovered months when using one and sends the selected month to preview", async () => {
    vi.mocked(hrApi.payrollReconciliationSourcePeriods).mockResolvedValue({ items: [{ periodMonth: "2026-08-01", recordCount: 2, mappedRecordCount: 1, unmappedRecordCount: 1, mappedEmployeeCount: 1, mappedItemCount: 3 }], total: 1, page: 1, pageSize: 50 });
    vi.mocked(hrApi.previewPayrollReconciliationSource).mockResolvedValue({ ...preview, periodMonth: "2026-08-01" });
    render(<ReconciliationSourcePreparation setup={setup} onPrepared={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("已导入来源"), { target: { value: "batch" } });
    fireEvent.change(screen.getByLabelText("工资账套"), { target: { value: "book" } });
    await screen.findByText("2026-08");
    fireEvent.click(screen.getByRole("button", { name: "使用此月份" }));
    expect(screen.getByLabelText("核对月份")).toHaveValue("2026-08");
    expect(screen.getByText("2 条工资记录 · 已关联 1 · 未关联 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "预览来源" }));
    await waitFor(() => expect(hrApi.previewPayrollReconciliationSource).toHaveBeenCalledWith(expect.objectContaining({ periodMonth: "2026-08-01" }), "synthetic-test-token", expect.any(AbortSignal)));
  });
  it("paginates discovered months and recovers from a request failure", async () => {
    vi.mocked(hrApi.payrollReconciliationSourcePeriods).mockRejectedValueOnce(new Error("读取失败")).mockResolvedValueOnce({ items: [], total: 51, page: 1, pageSize: 50 }).mockResolvedValueOnce({ items: [{ periodMonth: "2025-01-01", recordCount: 1, mappedRecordCount: 0, unmappedRecordCount: 1, mappedEmployeeCount: 0, mappedItemCount: 0 }], total: 51, page: 2, pageSize: 50 });
    render(<ReconciliationSourcePreparation setup={setup} onPrepared={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("已导入来源"), { target: { value: "batch" } });
    fireEvent.change(screen.getByLabelText("工资账套"), { target: { value: "book" } });
    await screen.findByText("读取失败");
    fireEvent.click(screen.getByRole("button", { name: "重试读取月份" }));
    await screen.findByText("第 1 页，共 2 页");
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByText("2025-01");
    expect(hrApi.payrollReconciliationSourcePeriods).toHaveBeenLastCalledWith({ legacyBatchId: "batch", bookId: "book" }, "synthetic-test-token", 2, 50, expect.any(AbortSignal));
  });

  it("clears visible month data and draft synchronously on identity change and rejects a late nonempty page",async()=>{
    const row={periodMonth:"2026-08-01",recordCount:2,mappedRecordCount:1,unmappedRecordCount:1,mappedEmployeeCount:1,mappedItemCount:3};
    let resolve!: (value:{items:typeof row[];total:number;page:number;pageSize:number})=>void;
    vi.mocked(hrApi.payrollReconciliationSourcePeriods).mockResolvedValueOnce({items:[row],total:51,page:1,pageSize:50}).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
    const view=render(<ReconciliationSourcePreparation setup={setup} onPrepared={vi.fn()}/>);
    choose();await screen.findByText("2026-08");
    fireEvent.click(screen.getByRole("button",{name:"下一页"}));
    const oldSignal=vi.mocked(hrApi.payrollReconciliationSourcePeriods).mock.calls.at(-1)![4]!;
    auth.user={...auth.user,park_id:"other"};view.rerender(<ReconciliationSourcePreparation setup={setup} onPrepared={vi.fn()}/>);
    expect(screen.queryByText("2026-08")).not.toBeInTheDocument();
    expect(screen.getByLabelText("已导入来源")).toHaveValue("");expect(screen.getByLabelText("工资账套")).toHaveValue("");expect(screen.getByLabelText("核对月份")).toHaveValue("");expect(oldSignal.aborted).toBe(true);
    await act(async()=>{resolve({items:[{...row,periodMonth:"2025-02-01"}],total:51,page:2,pageSize:50});});
    expect(screen.queryByText("2025-02")).not.toBeInTheDocument();expect(screen.queryByText("2026-08")).not.toBeInTheDocument();
  });
  it("discards late months after source selection changes and clears months when the book changes",async()=>{
    const row={periodMonth:"2026-08-01",recordCount:2,mappedRecordCount:1,unmappedRecordCount:1,mappedEmployeeCount:1,mappedItemCount:3};
    let resolve!: (value:{items:typeof row[];total:number;page:number;pageSize:number})=>void;
    const expanded={...setup,sourceBatches:[...(setup.sourceBatches??[]),{id:"batch2",createdAt:"2026-10-10T00:00:00Z",recordCount:20}],books:[...setup.books,{...setup.books[0]!,id:"book2",bookName:"另一个账套"}]};
    vi.mocked(hrApi.payrollReconciliationSourcePeriods).mockReturnValueOnce(new Promise(done=>{resolve=done;})).mockResolvedValueOnce({items:[{...row,periodMonth:"2026-09-01"}],total:1,page:1,pageSize:50});
    render(<ReconciliationSourcePreparation setup={expanded} onPrepared={vi.fn()}/>);choose();
    fireEvent.change(screen.getByLabelText("已导入来源"),{target:{value:"batch2"}});await screen.findByText("2026-09");
    await act(async()=>{resolve({items:[row],total:1,page:1,pageSize:50});});expect(screen.queryByText("2026-08")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("工资账套"),{target:{value:"book2"}});expect(screen.queryByText("2026-09")).not.toBeInTheDocument();
    await waitFor(()=>expect(hrApi.payrollReconciliationSourcePeriods).toHaveBeenLastCalledWith({legacyBatchId:"batch2",bookId:"book2"},"synthetic-test-token",1,50,expect.any(AbortSignal)));
  });
  it("aborts month reads on unmount and rejects previews for a different selected source",async()=>{
    let resolve!: (value:{items:[];total:number;page:number;pageSize:number})=>void;
    vi.mocked(hrApi.payrollReconciliationSourcePeriods).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
    const view=render(<ReconciliationSourcePreparation setup={setup} onPrepared={vi.fn()}/>);choose();
    const signal=vi.mocked(hrApi.payrollReconciliationSourcePeriods).mock.calls.at(-1)![4]!;view.unmount();expect(signal.aborted).toBe(true);
    await act(async()=>{resolve({items:[],total:0,page:1,pageSize:50});});
    vi.mocked(hrApi.previewPayrollReconciliationSource).mockResolvedValue({...preview,legacyBatchId:"other"});
    render(<ReconciliationSourcePreparation setup={setup} onPrepared={vi.fn()}/>);choose();fireEvent.click(screen.getByRole("button",{name:"预览来源"}));
    await screen.findByText("预览响应与当前选择不一致，请重新预览。");expect(screen.queryByRole("button",{name:"冻结核对来源"})).not.toBeInTheDocument();
  });
});
