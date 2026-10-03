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
it("historical definition GET carries the observed parent version and cancellation without a write key",async()=>{
  const signal=new AbortController().signal;
  await hrApi.insuranceSourcePolicyDefinition("synthetic/source",7,"synthetic-token",signal);
  expect(apiRequest).toHaveBeenCalledWith("/hr/insurance/policies/synthetic%2Fsource?expected_version=7",{token:"synthetic-token",signal});
  expect(createIdempotencyKey).not.toHaveBeenCalled();
});
it("owned-period writes preserve caller request identity, exact bases and stable retry keys",async()=>{
  const signal=new AbortController().signal;
  const preview={requestId:"synthetic-request",employeeId:"synthetic-employee",expectedEmployeeVersion:7,policyVersionId:"synthetic-version",expectedDefinitionHash:"a".repeat(64),periodMonth:"2026-10",includeFund:false,bases:[{insuranceKind:"oldage" as const,contributionBase:"90071992547409.91"}]};
  const confirm={requestId:"synthetic-confirm",previewId:"synthetic-preview",expectedPreviewHash:"b".repeat(64),reason:"合成核对"};
  const close={requestId:"synthetic-close",revisionId:"synthetic-revision",expectedPeriodVersion:1,reason:"合成关账"};
  const correct={...confirm,requestId:"synthetic-correct",previousRevisionId:"synthetic-revision",expectedPeriodVersion:1};
  await hrApi.createInsuranceOwnedPreview(preview,"synthetic-token","preview-key",signal);
  await hrApi.confirmInsuranceOwnedPeriod(confirm,"synthetic-token","confirm-key",signal);
  await hrApi.closeInsuranceOwnedPeriod(close,"synthetic-token","close-key",signal);
  await hrApi.correctInsuranceOwnedPeriod(correct,"synthetic-token","correct-key",signal);
  for(const [index,action,body,key] of [[1,"preview",preview,"preview-key"],[2,"confirm",confirm,"confirm-key"],[3,"close",close,"close-key"],[4,"correct",correct,"correct-key"]] as const){
    expect(apiRequest).toHaveBeenNthCalledWith(index,`/hr/insurance/owned-periods/${action}`,{method:"POST",body,token:"synthetic-token",signal,idempotencyKey:key});
  }
  expect(createIdempotencyKey).not.toHaveBeenCalled();
});
it("owned-period reads encode identities and search without a write key",async()=>{
  const signal=new AbortController().signal;
  await hrApi.insuranceOwnedPeriods("synthetic-token",2,"人员 & 名称",signal);
  await hrApi.insuranceOwnedPeriod("synthetic/id","synthetic-token",signal);
  const url=new URL(vi.mocked(apiRequest).mock.calls[0]![0],"http://fixture.invalid");
  expect(url.pathname).toBe("/hr/insurance/owned-periods");expect(url.searchParams.get("keyword")).toBe("人员 & 名称");expect(url.searchParams.get("page")).toBe("2");
  expect(apiRequest).toHaveBeenNthCalledWith(2,"/hr/insurance/owned-periods/synthetic%2Fid",{token:"synthetic-token",signal});
  expect(createIdempotencyKey).not.toHaveBeenCalled();
});
it("payroll source options preserve the selected sources, paging and cancellation without a write key",async()=>{
  const signal=new AbortController().signal;
  const query={legacyBatchId:"synthetic-batch",attendanceInputBatchId:"synthetic-attendance",reconciliationSourceId:"synthetic-frozen"};
  await hrApi.payrollInsuranceSourceOptions(query,"synthetic-token",3,signal);
  const [path,options]=vi.mocked(apiRequest).mock.calls[0]!;
  const url=new URL(path,"http://fixture.invalid");
  expect(url.pathname).toBe("/hr/payroll/reconciliations/insurance-sources");
  expect(Object.fromEntries(url.searchParams)).toEqual({...query,page:"3",page_size:"50"});
  expect(options).toEqual({token:"synthetic-token",signal});
  expect(createIdempotencyKey).not.toHaveBeenCalled();
});
it("payroll simulation transports explicit revision identity and reuses the caller retry key",async()=>{
  const signal=new AbortController().signal;
  const body={legacyBatchId:"synthetic-batch",attendanceInputBatchId:"synthetic-attendance",reconciliationSourceId:"synthetic-frozen",insuranceSources:[{employeeId:"synthetic-employee",sourceKind:"modern_confirmed" as const,sourceId:"synthetic-revision",expectedVersion:2,expectedHash:"a".repeat(64)}]};
  await hrApi.simulatePayrollReconciliation(body,"synthetic-token","stable-payroll-key",signal);
  expect(apiRequest).toHaveBeenCalledWith("/hr/payroll/reconciliations/simulate",{method:"POST",body,token:"synthetic-token",idempotencyKey:"stable-payroll-key",signal});
  expect(createIdempotencyKey).not.toHaveBeenCalled();
});
