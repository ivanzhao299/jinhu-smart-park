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

it("adds an optional exact application filter without changing ordinary callers",async()=>{
 const signal=new AbortController().signal;
 await hrApi.jobChangeApplications("token",1,20,undefined,signal,"00000000-0000-4000-8000-000000000051");
 expect(new URLSearchParams(String(vi.mocked(apiRequest).mock.calls[0]![0]).split("?")[1]).get("application_id")).toBe("00000000-0000-4000-8000-000000000051");
 await hrApi.jobChangeApplications("token",2,20,"returned",signal);
 const params=new URLSearchParams(String(vi.mocked(apiRequest).mock.calls[1]![0]).split("?")[1]);expect(params.has("application_id")).toBe(false);expect(params.get("page")).toBe("2");expect(params.get("status")).toBe("returned");
});
