import { expect, it, vi } from "vitest";
import { hrApi } from "../../lib/hr-api";
import { apiRequest } from "../../lib/api-client";
vi.mock("../../lib/api-client", () => ({ apiRequest: vi.fn(), createIdempotencyKey: vi.fn(() => "generated-key") }));
it("transports exact source, paging/filter/signal and the caller-owned full profile attempt", async () => {
 vi.mocked(apiRequest).mockResolvedValue({ data: {} } as Awaited<ReturnType<typeof apiRequest>>);
 const signal = new AbortController().signal;
 await hrApi.approvedProfileRequests("synthetic-token", 2, 20, "姓名 / E1", signal);
 expect(apiRequest).toHaveBeenLastCalledWith(`/hr/approvals/profile-fulfillments?${new URLSearchParams({ page: "2", page_size: "20", keyword: "姓名 / E1" })}`, { token: "synthetic-token", signal });
 const body = { employeeId: "employee", expectedApprovalVersion: 3, expectedVersion: 7, address: "new", idNumber: "" };
 await hrApi.fulfillProfileApproval("source / 1", body, "synthetic-token", "original-key");
 expect(apiRequest).toHaveBeenLastCalledWith("/hr/approvals/source%20%2F%201/profile-fulfillment", { method: "POST", body, token: "synthetic-token", idempotencyKey: "original-key" });
 await hrApi.fulfillProfileApproval("source", body, "synthetic-token");
 expect(apiRequest).toHaveBeenLastCalledWith("/hr/approvals/source/profile-fulfillment", { method: "POST", body, token: "synthetic-token", idempotencyKey: "generated-key" });
});
