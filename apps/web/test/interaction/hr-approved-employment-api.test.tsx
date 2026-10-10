import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
vi.mock("../../lib/api-client", () => ({ apiRequest: vi.fn(), createIdempotencyKey: vi.fn() }));
import { hrApi, type HrApprovedEmploymentDraft } from "../../lib/hr-api";
beforeEach(() => { vi.resetAllMocks(); vi.mocked(apiRequest).mockResolvedValue({ data: {} } as Awaited<ReturnType<typeof apiRequest>>); });
it("forwards page/search cancellation and the exact source version/body/key", async () => {
 const signal = new AbortController().signal;
 await hrApi.approvedEmploymentRequests("token", 2, 20, "姓名 & 编号", signal);
 const url = vi.mocked(apiRequest).mock.calls[0]![0]; expect(url).toContain("/hr/job-change-applications/approved-employment-requests?"); expect(new URLSearchParams(String(url).split("?")[1]).get("keyword")).toBe("姓名 & 编号"); expect(vi.mocked(apiRequest).mock.calls[0]![1]).toEqual({ token: "token", signal });
 const body: HrApprovedEmploymentDraft = { applicationName: "SYN", employeeId: "employee", applicationDate: "2026-10-10", effectiveDate: "2026-10-11", changeType: "transfer", afterOrgId: "org", reason: "Synthetic", expectedApprovalVersion: 7 };
 await hrApi.createJobChangeFromApproval("source", body, "token", "original-key"); expect(apiRequest).toHaveBeenLastCalledWith("/hr/job-change-applications/from-approval/source", { method: "POST", body, token: "token", idempotencyKey: "original-key" }); expect(createIdempotencyKey).not.toHaveBeenCalled();
});
