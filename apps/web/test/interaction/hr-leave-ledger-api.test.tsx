import { beforeEach, expect, it, vi } from "vitest";
import { leaveLedgerApi } from "../../lib/hr-leave-ledger-api";
const request = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api-client", () => ({ apiRequest: request }));
beforeEach(() => request.mockReset());
const type = { id: "type", typeCode: "SYN", typeName: "合成类型", enabled: true, version: 2 };
const quota = { id: "quota", employeeId: "employee", leaveTypeId: "type", periodStart: "2026-07-01", periodEnd: "2026-08-01", openingMinutes: 0, adjustmentMinutes: -60, version: 2 };
it("uses exact GET page, token and cancellation signal without a write key", async () => {
 const controller = new AbortController(); request.mockResolvedValue({ data: { items: [type], total: 21, page: 2, page_size: 20 } });
 expect((await leaveLedgerApi.types(2, "synthetic", controller.signal)).items).toEqual([type]);
 expect(request).toHaveBeenCalledWith("/hr/attendance/leave-types?page=2&page_size=20", { token: "synthetic", signal: controller.signal });
});
it("rejects malformed type, quota and history instead of normalizing missing facts", async () => {
 for (const row of [{ ...type, version: 0 }, { ...type, typeName: null }]) { request.mockResolvedValue({ data: { items: [row], total: 1, page: 1, page_size: 20 } }); await expect(leaveLedgerApi.types(1)).rejects.toThrow("返回不完整"); }
 request.mockResolvedValue({ data: { items: [{ ...quota, employeeName: {} }], total: 1, page: 1, page_size: 20 } }); await expect(leaveLedgerApi.quotas(1, "")).rejects.toThrow();
 request.mockResolvedValue({ data: { items: [{ id: "history", version: 1 }], total: 1, page: 1, page_size: 20 } }); await expect(leaveLedgerApi.history("type", "SYN", 1)).rejects.toThrow();
});
it("sends the caller's stable idempotency key and verifies matching type receipt", async () => {
 const body = { expectedVersion: 1, typeName: "合成类型", enabled: true, reason: "合成原因" }; request.mockResolvedValue({ data: type });
 await expect(leaveLedgerApi.putType("SYN", body, "synthetic", "stable-key")).resolves.toEqual(type);
 expect(request).toHaveBeenCalledWith("/hr/attendance/leave-types/SYN", { method: "PUT", body, token: "synthetic", idempotencyKey: "stable-key" });
 request.mockResolvedValue({ data: { ...type, typeCode: "OTHER" } }); await expect(leaveLedgerApi.putType("SYN", body, "synthetic", "stable-key")).rejects.toThrow("保持原表单重试");
});
it("keeps explicit zero and signed quota correction and rejects a different owner's receipt", async () => {
 const body = { employeeId: "employee", leaveTypeId: "type", periodStart: "2026-07-01", periodEnd: "2026-08-01", openingMinutes: 0, adjustmentMinutes: -60, reason: "合成原因" }; request.mockResolvedValue({ data: quota });
 await expect(leaveLedgerApi.createQuota(body, undefined, "stable-quota")).resolves.toEqual(quota);
 request.mockResolvedValue({ data: { ...quota, employeeId: "other" } }); await expect(leaveLedgerApi.createQuota(body, undefined, "stable-quota")).rejects.toThrow("回执不完整");
 request.mockResolvedValue({ data: quota }); await expect(leaveLedgerApi.putQuota("quota", { expectedVersion: 1, openingMinutes: 0, adjustmentMinutes: -60, reason: "合成原因" }, undefined, "stable-edit")).resolves.toEqual(quota);
});
