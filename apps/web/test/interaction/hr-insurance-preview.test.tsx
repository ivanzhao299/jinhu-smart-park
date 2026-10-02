import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrInsurancePreviewClient } from "../../app/hr/insurance/preview/HrInsurancePreviewClient";
import { hrApi, type HrInsuranceReferenceResult } from "../../lib/hr-api";

const state = vi.hoisted(() => ({ user: { id: "synthetic-actor", park_id: "synthetic-park", permissions: ["*"], enabled_modules: [{ module_code: "hr", enabled: true }] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { insurancePolicies: vi.fn(), employees: vi.fn(), insuranceReferencePreview: vi.fn() } }));
const kinds = ["oldage", "remedy", "losework", "wound", "bear", "fund"];
const policy = { id: "synthetic-policy", code: "TEST", name: "合成参考政策", version: 7, status: "historical", availableVariants: [1, 2] };
const result: HrInsuranceReferenceResult = {
  mode: "reference_only", confirmationEligible: false, inputHash: "not-visible-hash", employeeId: "synthetic-employee", periodYear: 2026, periodMonth: 7,
  policy: { ...policy, variantNo: 1 },
  calculation: { engineVersion: "synthetic-engine", policyVersion: 7, includeFund: false,
    items: kinds.map(insuranceKind => ({ insuranceKind, contributionBase: "90071992547409.91", amounts: { base: "0.01", employee: "0.01", employer: "0.02", supplement: "0.00" } })),
    totals: { base: "0.05", employee: "0.05", employer: "0.10", supplement: "0.00" } },
};
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "synthetic-actor", park_id: "synthetic-park", permissions: ["*"], enabled_modules: [{ module_code: "hr", enabled: true }] };
  vi.mocked(hrApi.insurancePolicies).mockResolvedValue({ items: [policy], total: 21, page: 1, page_size: 20, insuranceKinds: kinds });
  vi.mocked(hrApi.employees).mockResolvedValue({ items: [{ id: "synthetic-employee", fullName: "合成员工", employeeCode: "TEST001" }], total: 21, page: 1, page_size: 20 } as Awaited<ReturnType<typeof hrApi.employees>>);
  vi.mocked(hrApi.insuranceReferencePreview).mockResolvedValue(result);
});
async function completeForm() {
  await screen.findByRole("option", { name: /合成参考政策/ });
  await screen.findByRole("option", { name: /合成员工/ });
  fireEvent.change(screen.getByLabelText("选择政策"), { target: { value: policy.id } });
  fireEvent.change(screen.getByLabelText("选择员工"), { target: { value: "synthetic-employee" } });
  fireEvent.change(screen.getByLabelText("政策方案"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("公积金汇总"), { target: { value: "exclude" } });
  fireEvent.change(screen.getByLabelText("核对年份"), { target: { value: "2026" } });
  fireEvent.change(screen.getByLabelText("核对月份"), { target: { value: "7" } });
  for (const field of screen.getAllByRole("spinbutton").filter(field => field !== screen.getByLabelText("核对年份"))) fireEvent.change(field, { target: { value: "90071992547409.91" } });
}
it("denied or incomplete permissions issue no policy, employee or amount requests", () => {
  state.user.permissions = ["hr:insurance:team_read"];
  render(<HrInsurancePreviewClient />);
  expect(screen.getByText(/无权访问社保参考试算/)).toBeVisible();
  expect(hrApi.insurancePolicies).not.toHaveBeenCalled();
  expect(hrApi.employees).not.toHaveBeenCalled();
  expect(hrApi.insuranceReferencePreview).not.toHaveBeenCalled();
});
it("requires explicit period, fund and six bases; sends exact strings and independent reference totals", async () => {
  render(<HrInsurancePreviewClient />);
  expect(screen.getByLabelText("核对年份")).toHaveValue(null);
  expect(screen.getByRole("button", { name: "参考试算" })).toBeDisabled();
  await completeForm();
  fireEvent.click(screen.getByRole("button", { name: "参考试算" }));
  const output = await screen.findByLabelText("社保参考结果");
  expect(within(output).getByText("政策合计 ¥ 0.05")).toBeVisible();
  expect(within(output).getByText("单位 ¥ 0.10")).toBeVisible();
  expect(within(output).getByText(/未计入汇总/)).toBeVisible();
  expect(screen.queryByText("not-visible-hash")).toBeNull();
  expect(hrApi.insuranceReferencePreview).toHaveBeenCalledWith(expect.objectContaining({ expectedPolicyVersion: 7, includeFund: false, periodYear: 2026, periodMonth: 7, bases: kinds.map(insuranceKind => ({ insuranceKind, contributionBase: "90071992547409.91" })) }), "synthetic-token", expect.any(AbortSignal));
  fireEvent.change(screen.getByLabelText("核对月份"), { target: { value: "8" } });
  expect(screen.queryByLabelText("社保参考结果")).toBeNull();
  expect(screen.getByLabelText("养老保险基数")).toHaveValue(null);
  expect(screen.getByRole("button", { name: "参考试算" })).toBeDisabled();
});
it("input changes cancel and suppress late calculation results", async () => {
  let resolve!: (value: HrInsuranceReferenceResult) => void;
  vi.mocked(hrApi.insuranceReferencePreview).mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<HrInsurancePreviewClient />);
  await completeForm();
  fireEvent.click(screen.getByRole("button", { name: "参考试算" }));
  const signal = vi.mocked(hrApi.insuranceReferencePreview).mock.calls[0]![2]!;
  fireEvent.change(screen.getByLabelText("养老保险基数"), { target: { value: "100.01" } });
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(result));
  expect(screen.queryByLabelText("社保参考结果")).toBeNull();
});
it("context changes clear inputs and late sensitive responses; revocation unmounts form", async () => {
  let resolve!: (value: HrInsuranceReferenceResult) => void;
  vi.mocked(hrApi.insuranceReferencePreview).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<HrInsurancePreviewClient />);
  await completeForm();
  fireEvent.click(screen.getByRole("button", { name: "参考试算" }));
  state.user = { ...state.user, park_id: "another-synthetic-park" };
  view.rerender(<HrInsurancePreviewClient />);
  expect(screen.getByLabelText("核对年份")).toHaveValue(null);
  await act(async () => resolve(result));
  expect(screen.queryByLabelText("社保参考结果")).toBeNull();
  state.user.permissions = ["hr:insurance:read"];
  view.rerender(<HrInsurancePreviewClient />);
  expect(screen.queryByLabelText("社保试算参数")).toBeNull();
});
it("policy and employee search/pagination remain independent and clear selected inputs", async () => {
  render(<HrInsurancePreviewClient />);
  await completeForm();
  fireEvent.click(within(screen.getByLabelText("政策分页")).getByRole("button", { name: "下一页" }));
  await waitFor(() => expect(hrApi.insurancePolicies).toHaveBeenLastCalledWith("synthetic-token", 2, "", expect.any(AbortSignal)));
  expect(screen.getByLabelText("选择政策")).toHaveValue("");
  expect(screen.getByLabelText("选择员工")).toHaveValue("synthetic-employee");
  fireEvent.change(screen.getByLabelText("员工关键词"), { target: { value: " TEST " } });
  fireEvent.click(screen.getByRole("button", { name: "搜索员工" }));
  await waitFor(() => expect(hrApi.employees).toHaveBeenLastCalledWith("synthetic-token", 1, 20, { keyword: "TEST" }));
  expect(screen.getByLabelText("选择员工")).toHaveValue("");
  expect(screen.getByLabelText("养老保险基数")).toHaveValue(null);
});

it("disabled HR module blocks the actual page guard before loading sensitive catalogs", () => {
  state.user.enabled_modules = [{ module_code: "hr", enabled: false }];
  render(<HrInsurancePreviewClient />);
  expect(screen.getByText(/无权访问社保参考试算/)).toBeVisible();
  expect(hrApi.insurancePolicies).not.toHaveBeenCalled();
  expect(hrApi.employees).not.toHaveBeenCalled();
});
