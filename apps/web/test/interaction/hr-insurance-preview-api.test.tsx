import { beforeEach, expect, it, vi } from "vitest";
import { hrApi } from "../../lib/hr-api";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
vi.mock("../../lib/api-client", () => ({ apiRequest: vi.fn(), createIdempotencyKey: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiRequest).mockResolvedValue({ data: { mode: "reference_only" } } as Awaited<ReturnType<typeof apiRequest>>);
  vi.mocked(createIdempotencyKey).mockReturnValue("synthetic-action-key");
});
it("reference POST carries global guard key, exact input and cancellation signal", async () => {
  const body = { policyId: "synthetic-policy", expectedPolicyVersion: 7, variantNo: 1, employeeId: "synthetic-employee", periodYear: 2026, periodMonth: 7, includeFund: false, bases: [{ insuranceKind: "oldage", contributionBase: "90071992547409.91" }] };
  const signal = new AbortController().signal;
  await hrApi.insuranceReferencePreview(body, "synthetic-token", signal);
  expect(createIdempotencyKey).toHaveBeenCalledWith("hr-insurance-reference-preview");
  expect(apiRequest).toHaveBeenCalledWith("/hr/insurance/reference-preview", { method: "POST", body, token: "synthetic-token", signal, idempotencyKey: "synthetic-action-key" });
});
it("policy metadata query encodes search and page with no write key", async () => {
  const signal = new AbortController().signal;
  await hrApi.insurancePolicies("synthetic-token", 2, "养老 & 基金", signal);
  const [path, options] = vi.mocked(apiRequest).mock.calls[0]!;
  const url = new URL(path, "http://fixture.invalid");
  expect(url.pathname).toBe("/hr/insurance/policies");
  expect(url.searchParams.get("keyword")).toBe("养老 & 基金");
  expect(url.searchParams.get("page")).toBe("2");
  expect(url.searchParams.get("page_size")).toBe("20");
  expect(options).toEqual({ token: "synthetic-token", signal });
  expect(createIdempotencyKey).not.toHaveBeenCalled();
});
it("durable policy save transports the caller's stable business request and HTTP retry key",async()=>{
  const body={requestId:"synthetic-request",policyCode:"TEST",policyName:"合成政策",variantNo:1,effectiveFrom:"2026-01",effectiveThrough:"2026-12",reason:"合成依据",sourcePolicyId:"synthetic-source",expectedSourceVersion:7};
  const signal=new AbortController().signal;await hrApi.createInsurancePolicyVersion(body,"synthetic-token","stable-retry-key",signal);
  expect(apiRequest).toHaveBeenCalledWith("/hr/insurance/policy-versions",{method:"POST",body,token:"synthetic-token",signal,idempotencyKey:"stable-retry-key"});expect(createIdempotencyKey).not.toHaveBeenCalled();
});
