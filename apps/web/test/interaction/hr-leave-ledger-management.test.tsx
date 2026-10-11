import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LeaveLedgerManagement } from "../../app/hr/attendance/LeaveLedgerManagement";
import type * as ApiClient from "../../lib/api-client";
const mocks = vi.hoisted(() => ({ types: vi.fn(), quotas: vi.fn(), history: vi.fn(), putType: vi.fn(), createQuota: vi.fn(), putQuota: vi.fn(), employees: vi.fn(), key: 0 }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/api-client", async original => ({ ...await original<typeof ApiClient>(), createIdempotencyKey: () => `synthetic-${++mocks.key}` }));
vi.mock("../../lib/hr-leave-ledger-api", () => ({ leaveLedgerApi: mocks }));
vi.mock("../../lib/hr-leave-balance-api", () => ({ leaveBalanceApi: { employees: mocks.employees } }));
const type = { id: "type", typeCode: "SYN", typeName: "合成假期", enabled: true, version: 3 };
const quota = { id: "quota", employeeId: "employee", leaveTypeId: "type", employeeName: "合成人员", employeeCode: "SYN-01", typeName: "合成假期", periodStart: "2026-07-01", periodEnd: "2026-08-01", openingMinutes: 480, adjustmentMinutes: -60, version: 2 };
const page = <T,>(items: T[], n = 1, total = items.length) => ({ items, page: n, total, page_size: 20 });
beforeEach(() => {
 Object.values(mocks).forEach(value => { if (typeof value === "function") value.mockReset(); }); mocks.key = 0;
 mocks.types.mockResolvedValue(page([type])); mocks.quotas.mockResolvedValue(page([quota]));
 mocks.employees.mockResolvedValue(page([{ id: "employee", employeeName: "合成人员", employeeCode: "SYN-01", isSelf: false }]));
 mocks.history.mockResolvedValue(page([{ id: "history", version: 3, reason: "合成修改原因", typeName: "合成假期", enabled: true, actorName: "合成办理人", occurredAt: "2026-07-01T00:00:00Z" }]));
 mocks.putType.mockResolvedValue(type); mocks.putQuota.mockResolvedValue(quota); mocks.createQuota.mockResolvedValue(quota);
});
afterEach(cleanup);
async function open() { render(<LeaveLedgerManagement />); fireEvent.click(screen.getByRole("button", { name: "打开假期管理" })); await screen.findByRole("button", { name: "修改类型 SYN" }); }
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
it("does not read management data before expanding", () => { render(<LeaveLedgerManagement />); expect(mocks.types).not.toHaveBeenCalled(); expect(mocks.quotas).not.toHaveBeenCalled(); });
it("creates an explicitly configured type with version zero and reason", async () => {
 await open(); fireEvent.click(screen.getByRole("button", { name: "新增假期类型" })); fill("假期代码", "SYN_NEW"); fill("假期名称", "\u200b新合成类型\u200b"); fill("办理原因", "合成新增原因");
 fireEvent.click(screen.getByRole("button", { name: "保存假期台账" }));
 await waitFor(() => expect(mocks.putType).toHaveBeenCalledWith("SYN_NEW", { expectedVersion: 0, typeName: "新合成类型", enabled: true, reason: "合成新增原因" }, "synthetic-token", "synthetic-1"));
 expect(await screen.findByText(/已保存，正在重新读取台账/)).toBeInTheDocument();
});
it("keeps the same key and form after unknown write outcome and allows one active write", async () => {
 let fail!: (error: Error) => void; mocks.putType.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
 await open(); fireEvent.click(screen.getByRole("button", { name: "修改类型 SYN" })); fill("办理原因", "合成停用原因"); fireEvent.click(screen.getByLabelText("启用此假期类型"));
 const save = screen.getByRole("button", { name: "保存假期台账" }); fireEvent.click(save); fireEvent.click(save);
 expect(mocks.putType).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "收起假期管理" })).toBeDisabled();
 fail(new Error("连接中断")); await screen.findByRole("alert"); expect(screen.getByLabelText("办理原因")).toHaveValue("合成停用原因");
 fireEvent.click(screen.getByRole("button", { name: "保存假期台账" })); await waitFor(() => expect(mocks.putType).toHaveBeenCalledTimes(2));
 expect(mocks.putType.mock.calls[1]![3]).toBe(mocks.putType.mock.calls[0]![3]); expect(mocks.putType.mock.calls[1]![1]).toEqual({ expectedVersion: 3, typeName: "合成假期", enabled: false, reason: "合成停用原因" });
});
it("edits only amounts for an existing quota while retaining its immutable ownership and period", async () => {
 await open(); fireEvent.click(screen.getByRole("button", { name: "调整额度 SYN-01" })); expect(screen.queryByLabelText("额度员工")).toBeNull(); expect(screen.queryByLabelText("额度起日")).toBeNull();
 fill("期初额度（分钟）", "0"); fill("额度调整（分钟，可负）", "-120"); fill("办理原因", "合成调整原因"); fireEvent.click(screen.getByRole("button", { name: "保存假期台账" }));
 await waitFor(() => expect(mocks.putQuota).toHaveBeenCalledWith("quota", { expectedVersion: 2, openingMinutes: 0, adjustmentMinutes: -120, reason: "合成调整原因" }, "synthetic-token", "synthetic-1"));
});
it("creates quota for a selected employee and type using explicit dates and zero", async () => {
 await open(); fireEvent.click(screen.getByRole("button", { name: "登记员工额度" })); await waitFor(() => expect(screen.getByLabelText("额度员工")).toBeEnabled());
 fireEvent.change(screen.getByLabelText("额度员工"), { target: { value: "employee" } }); fireEvent.change(screen.getByLabelText("额度假期类型"), { target: { value: "type" } });
 fill("额度起日", "2026-07-01"); fill("额度截止日（不含）", "2026-08-01"); fill("办理原因", "合成额度登记"); fireEvent.click(screen.getByRole("button", { name: "保存假期台账" }));
 await waitFor(() => expect(mocks.createQuota).toHaveBeenCalledWith({ employeeId: "employee", leaveTypeId: "type", periodStart: "2026-07-01", periodEnd: "2026-08-01", openingMinutes: 0, adjustmentMinutes: 0, reason: "合成额度登记" }, "synthetic-token", "synthetic-1"));
});
it("shows successful save separately from a subsequent list read failure", async () => {
 await open(); fireEvent.click(screen.getByRole("button", { name: "修改类型 SYN" })); fill("办理原因", "合成更新原因"); mocks.types.mockRejectedValue(new Error("刷新暂不可用"));
 fireEvent.click(screen.getByRole("button", { name: "保存假期台账" })); expect(await screen.findByText(/已保存，正在重新读取台账/)).toBeInTheDocument(); expect(await screen.findByRole("alert")).toHaveTextContent("刷新暂不可用"); expect(mocks.putType).toHaveBeenCalledTimes(1);
});
it("retains all history pages and reloads the twenty first version", async () => {
 mocks.history.mockImplementation((_kind, _id, n) => Promise.resolve(page([{ id: `history-${n}`, version: n === 1 ? 21 : 1, reason: n === 1 ? "最近版本原因" : "最初版本原因", typeName: "合成假期", enabled: true, actorName: "合成办理人", occurredAt: "2026-07-01T00:00:00Z" }], n, 21)));
 await open(); fireEvent.click(screen.getByRole("button", { name: "类型历史 SYN" })); await screen.findByText("最近版本原因"); fireEvent.click(screen.getByRole("button", { name: "历史下一页" })); expect(await screen.findByText("最初版本原因")).toBeInTheDocument();
 expect(mocks.history.mock.calls[1]!.slice(0, 4)).toEqual(["type", "SYN", 2, "synthetic-token"]);
});
it("pages employee candidates and types without losing an explicit selection", async () => {
 mocks.employees.mockImplementation(n => Promise.resolve(page([{ id: n === 1 ? "employee" : "employee21", employeeCode: `SYN-${n}`, employeeName: n === 1 ? "第一页人员" : "第二十一位人员", isSelf: false }], n, 21)));
 mocks.types.mockImplementation(n => Promise.resolve(page([{ ...type, id: n === 1 ? "type" : "type21", typeCode: `SYN${n}`, typeName: n === 1 ? "第一页类型" : "第二十一类型" }], n, 21)));
 render(<LeaveLedgerManagement />); fireEvent.click(screen.getByRole("button", { name: "打开假期管理" })); await screen.findByRole("button", { name: "修改类型 SYN1" }); fireEvent.click(screen.getByRole("button", { name: "登记员工额度" })); await screen.findByRole("option", { name: "第一页人员 · SYN-1" });
 fireEvent.click(screen.getByRole("button", { name: "候选员工下一页" })); await screen.findByRole("option", { name: "第二十一位人员 · SYN-2" }); fireEvent.change(screen.getByLabelText("额度员工"), { target: { value: "employee21" } });
 fireEvent.click(screen.getByRole("button", { name: "候选类型下一页" })); await screen.findByRole("option", { name: "第二十一类型" }); fireEvent.change(screen.getByLabelText("额度假期类型"), { target: { value: "type21" } });
 expect(screen.getByLabelText("额度员工")).toHaveValue("employee21"); expect(screen.getByLabelText("额度假期类型")).toHaveValue("type21");
});
