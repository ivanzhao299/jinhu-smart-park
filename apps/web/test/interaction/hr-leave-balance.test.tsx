import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HrLeaveBalanceReport } from "@jinhu/shared";
import { LeaveBalancePanel } from "../../app/hr/attendance/LeaveBalancePanel";
import { decodeLeaveBalanceReport } from "../../lib/hr-leave-balance-api";
import type * as BalanceApi from "../../lib/hr-leave-balance-api";

const mocks = vi.hoisted(() => ({ employees: vi.fn(), report: vi.fn(), token: "synthetic-token" }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => mocks.token }));
vi.mock("../../lib/hr-leave-balance-api", async original => ({
 ...await original<typeof BalanceApi>(),
 leaveBalanceApi: { employees: mocks.employees, report: mocks.report },
}));
const person = { id: "synthetic-employee", employeeCode: "SYN-01", employeeName: "合成人员", isSelf: true };
const item = { leaveTypeId: "type", typeCode: "SYN", typeName: "合成假期", enabled: true, quotaId: "quota", quotaVersion: 1,
 openingMinutes: 0, adjustmentMinutes: 0, observedMinutes: 120, consumedMinutes: 120, balanceMinutes: -120, blockers: [] };
function report(from: string, to: string, page = 1): HrLeaveBalanceReport {
 return { employee: person, from, to, page, page_size: 20, total: 1, timezone: "Asia/Shanghai", observedAt: "2026-07-31T01:00:00Z",
 basis: "registered_system_facts", basisHash: "a".repeat(64), missingScheduleDates: [], unclassifiedMinutes: 0,
 undatedApprovedRequestCount: 0, sources: { schedules: [], requests: [], cancellations: [], quotas: [] }, items: [{ ...item }] };
}
beforeEach(() => {
 mocks.token = "synthetic-token"; mocks.employees.mockReset(); mocks.report.mockReset();
 mocks.employees.mockResolvedValue({ items: [person], total: 1, page: 1, page_size: 20 });
 mocks.report.mockImplementation((_id, from, to, page) => Promise.resolve(report(from, to, page)));
});
afterEach(cleanup);
async function open() {
 render(<LeaveBalancePanel />); fireEvent.click(screen.getByRole("button", { name: "员工假期余额" }));
 await waitFor(() => expect(screen.getByRole("button", { name: "读取余额" })).toBeEnabled());
}
it("reads lazily and preserves explicit zero and negative balance", async () => {
 render(<LeaveBalancePanel />); expect(mocks.employees).not.toHaveBeenCalled(); cleanup(); await open();
 expect(mocks.report).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "读取余额" }));
 expect(await screen.findByText("剩余额度：-120 分钟")).toBeInTheDocument();
 expect(screen.getByText("期初额度：0 分钟")).toBeInTheDocument();
});
it("keeps unknown quantities distinct from zero and exposes missing coverage", async () => {
 mocks.report.mockImplementation((_id, from, to) => Promise.resolve({ ...report(from, to), missingScheduleDates: [from],
 items: [{ ...item, quotaId: null, quotaVersion: null, openingMinutes: null, adjustmentMinutes: null, consumedMinutes: null, balanceMinutes: null, blockers: ["opening_unknown", "schedule_coverage_incomplete"] }] }));
 await open(); fireEvent.click(screen.getByRole("button", { name: "读取余额" }));
 expect(await screen.findByText("剩余额度：待完善")).toBeInTheDocument(); expect(screen.getByText("未登记本区间期初额度")).toBeInTheDocument();
 expect(screen.queryByText("剩余额度：0 分钟")).toBeNull();
});
it("reads the next type page with the same employee and dates", async () => {
 mocks.report.mockImplementation((_id, from, to, page) => Promise.resolve({ ...report(from, to, page), total: 21,
 items: [{ ...item, typeName: page === 1 ? "第一页假期" : "第二十一类假期" }] }));
 await open(); fireEvent.click(screen.getByRole("button", { name: "读取余额" })); await screen.findByText("第一页假期");
 fireEvent.click(screen.getByRole("button", { name: "余额下一页" })); expect(await screen.findByText("第二十一类假期")).toBeInTheDocument();
 expect(mocks.report.mock.calls[1]!.slice(0, 3)).toEqual(mocks.report.mock.calls[0]!.slice(0, 3));
 expect(mocks.report.mock.calls[1]![3]).toBe(2);
});
it("rejects wrong ownership and allows retry without showing a balance", async () => {
 mocks.report.mockImplementationOnce((_id, from, to) => Promise.resolve({ ...report(from, to), employee: { ...person, id: "other" } }));
 await open(); fireEvent.click(screen.getByRole("button", { name: "读取余额" }));
 expect(await screen.findByRole("alert")).toHaveTextContent("余额归属或区间不一致"); expect(screen.queryByText(/剩余额度/)).toBeNull();
 fireEvent.click(screen.getByRole("button", { name: "读取余额" })); expect(await screen.findByText("剩余额度：-120 分钟")).toBeInTheDocument();
});
it("discards a pending report after changing its date", async () => {
 let finish!: (value: HrLeaveBalanceReport) => void;
 mocks.report.mockImplementation((_id, from, to) => new Promise<HrLeaveBalanceReport>(resolve => { finish = () => resolve(report(from, to)); }));
 await open(); fireEvent.click(screen.getByRole("button", { name: "读取余额" }));
 fireEvent.change(screen.getByLabelText("额度起日"), { target: { value: "2026-07-01" } }); finish(report("2026-07-01", "2026-08-01"));
 await waitFor(() => expect(screen.queryByRole("status")).toBeNull()); expect(screen.queryByText(/剩余额度/)).toBeNull();
});
it("does not publish a response after the login context changes", async () => {
 let finish!: () => void;
 mocks.report.mockImplementation((_id, from, to) => new Promise(resolve => { finish = () => resolve(report(from, to)); }));
 await open(); fireEvent.click(screen.getByRole("button", { name: "读取余额" })); mocks.token = "changed-context"; finish();
 await waitFor(() => expect(screen.queryByRole("status")).toBeNull()); expect(screen.queryByText(/剩余额度/)).toBeNull();
});
it("rejects malformed quantities and contradictory unknown balance contracts", () => {
 const valid = report("2026-07-01", "2026-08-01"); expect(decodeLeaveBalanceReport(valid)).toEqual(valid);
 for (const patch of [{ openingMinutes: -1 }, { consumedMinutes: -1 }, { quotaVersion: 0 }, { blockers: ["invented"] }, { openingMinutes: null }, { blockers: ["schedule_coverage_incomplete"] }]) {
  expect(() => decodeLeaveBalanceReport({ ...valid, items: [{ ...item, ...patch }] })).toThrow("不能按零处理");
 }
 expect(() => decodeLeaveBalanceReport({ ...valid, from: "2026-02-30" })).toThrow();
});
