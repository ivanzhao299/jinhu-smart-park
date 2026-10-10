import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrInsuranceOwnedPeriodsClient } from "../../app/hr/insurance/periods/HrInsuranceOwnedPeriodsClient";
import { hrApi, type HrInsurancePolicyVersionDetail } from "../../lib/hr-api";
import type { HrInsuranceOwnedPeriodListItem, HrInsuranceOwnedPreview } from "@jinhu/shared";
const state = vi.hoisted(() => ({ user: { id: "synthetic", park_id: "synthetic", permissions: ["*"], enabled_modules: [{ module_code: "hr", enabled: true }] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { insuranceOwnedPeriods: vi.fn(), insuranceOwnedPeriod: vi.fn(), insuranceOwnedEmployees: vi.fn(), insurancePolicyVersions: vi.fn(), insurancePolicyVersion: vi.fn(), createInsuranceOwnedPreview: vi.fn(), confirmInsuranceOwnedPeriod: vi.fn(), closeInsuranceOwnedPeriod: vi.fn(), correctInsuranceOwnedPeriod: vi.fn() } }));
const kinds = ["oldage", "remedy", "losework", "wound", "bear", "fund"] as const;
const employee = { id: "synthetic-employee", employeeCode: "SYN-1", fullName: "合成人员", version: 7, employmentStatus: "active", previewEligible: true };
const policy: HrInsurancePolicyVersionDetail = { id: "synthetic-policy", policyCode: "SYN", policyName: "合成政策", variantNo: 1, versionNo: 3, effectiveFrom: "2026-01", effectiveThrough: "2026-12", definitionHash: "a".repeat(64), createdAt: "2026-01-01Z", mode: "immutable_definition", activated: false, engineVersion: "synthetic", originKind: "manual", reason: "合成依据", items: kinds.map(insuranceKind => ({ insuranceKind, factors: { base: { rate: "0.010000", fixedAmount: null }, employer: { rate: "0.010000", fixedAmount: null }, employee: { rate: "0.010000", fixedAmount: null }, supplement: { rate: "0.010000", fixedAmount: null } } })) };
const calculation = { engineVersion: "synthetic", policyVersion: 3, includeFund: false, totals: { base: "0.50", employer: "0.50", employee: "0.50", supplement: "0.50" }, items: kinds.map(insuranceKind => ({ insuranceKind, contributionBase: "10.00", amounts: { base: "0.10", employer: "0.10", employee: "0.10", supplement: "0.10" } })) };
const preview: HrInsuranceOwnedPreview = { id: "synthetic-preview", employeeId: employee.id, employeeVersion: 7, policyVersionId: policy.id, periodMonth: "2026-10", includeFund: false, previewHash: "b".repeat(64), expiresAt: "2070-01-01T00:00:00Z", calculation, mode: "owned_preview", confirmationRequiresRevalidation: true };
const period: HrInsuranceOwnedPeriodListItem = { id: "synthetic-revision", employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName, periodMonth: "2026-10", revisionNo: 1, previewId: preview.id, previousRevisionId: null, previewHash: preview.previewHash, calculation, sourceKind: "modern_confirmed", current: true, status: "confirmed" };
beforeEach(() => {
  vi.clearAllMocks(); state.user = { id: "synthetic", park_id: "synthetic", permissions: ["*"], enabled_modules: [{ module_code: "hr", enabled: true }] };
  vi.mocked(hrApi.insuranceOwnedPeriods).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
  vi.mocked(hrApi.insuranceOwnedEmployees).mockResolvedValue({ items: [employee], total: 1, page: 1, page_size: 20 });
  vi.mocked(hrApi.insurancePolicyVersions).mockResolvedValue({ items: [policy], total: 1, page: 1, page_size: 20 }); vi.mocked(hrApi.insurancePolicyVersion).mockResolvedValue(policy);
  vi.mocked(hrApi.createInsuranceOwnedPreview).mockResolvedValue({ ...preview, replayed: false }); vi.mocked(hrApi.confirmInsuranceOwnedPeriod).mockResolvedValue({ ...period, replayed: false });
  vi.mocked(hrApi.insuranceOwnedPeriod).mockResolvedValue(period); vi.mocked(hrApi.closeInsuranceOwnedPeriod).mockResolvedValue({ id: "synthetic-close", revisionId: period.id, revisionNo: 1, status: "closed", replayed: false });
  vi.mocked(hrApi.correctInsuranceOwnedPeriod).mockResolvedValue({ ...period, id: "synthetic-correction", revisionNo: 2, previousRevisionId: period.id, replayed: false });
});
async function fill(target = false) {
  if (!target) fireEvent.click(await screen.findByRole("button", { name: "新建期间" }));
  const form = within(screen.getByLabelText(target ? "更正社保期间" : "新建社保期间"));
  await form.findByRole("option", { name: /合成人员/ }); fireEvent.change(form.getByLabelText("员工"), { target: { value: employee.id } });
  await form.findByRole("option", { name: /合成政策/ }); fireEvent.change(form.getByLabelText("政策版本"), { target: { value: policy.id } });
  await form.findByLabelText("所选政策定义");
  if (!target) fireEvent.change(form.getByLabelText("核算月份"), { target: { value: "2026-10" } });
  fireEvent.change(form.getByLabelText("公积金汇总"), { target: { value: "exclude" } });
  for (const input of form.getAllByRole("spinbutton")) fireEvent.change(input, { target: { value: "10.00" } });
  return form;
}
it("denied roles and disabled module issue no reads; readers do not probe action catalogs", async () => {
  state.user.permissions = ["hr:insurance:team_read"];
  const view = render(<HrInsuranceOwnedPeriodsClient />); expect(screen.getByText(/无权访问现代社保期间/)).toBeVisible(); expect(hrApi.insuranceOwnedPeriods).not.toHaveBeenCalled();
  state.user.permissions = ["hr:insurance", "hr:insurance:read", "hr:insurance_amount:read", "hr:employee:read"];
  view.rerender(<HrInsuranceOwnedPeriodsClient />); await screen.findByText(/没有已确认/);
  expect(screen.queryByRole("button", { name: "新建期间" })).toBeNull(); expect(hrApi.insuranceOwnedEmployees).not.toHaveBeenCalled(); expect(hrApi.insurancePolicyVersions).not.toHaveBeenCalled();
});
it("explicit preview binds observed employee and policy; confirm uses returned hash and reason", async () => {
  render(<HrInsuranceOwnedPeriodsClient />); const form = await fill();
  fireEvent.click(form.getByRole("button", { name: "生成期间预览" })); await form.findByLabelText("待确认预览");
  expect(hrApi.createInsuranceOwnedPreview).toHaveBeenCalledWith(expect.objectContaining({ employeeId: employee.id, expectedEmployeeVersion: 7, policyVersionId: policy.id, expectedDefinitionHash: policy.definitionHash, periodMonth: "2026-10", includeFund: false, bases: kinds.map(insuranceKind => ({ insuranceKind, contributionBase: "10.00" })) }), "synthetic-token", expect.any(String), expect.any(AbortSignal));
  fireEvent.change(form.getByLabelText("操作依据"), { target: { value: "合成核对" } }); fireEvent.click(form.getByRole("button", { name: "确认期间" }));
  expect(await screen.findByText("2026-10 · 版本 1 已确认")).toBeVisible(); expect(hrApi.confirmInsuranceOwnedPeriod).toHaveBeenCalledWith(expect.objectContaining({ previewId: preview.id, expectedPreviewHash: preview.previewHash, reason: "合成核对" }), "synthetic-token", expect.any(String), expect.any(AbortSignal)); expect(screen.queryByLabelText("新建社保期间")).toBeNull();
});
it("unchanged preview and confirmation failures retain keys; editing invalidates the old preview", async () => {
  vi.mocked(hrApi.createInsuranceOwnedPreview).mockRejectedValueOnce(new Error("synthetic failure")); vi.mocked(hrApi.confirmInsuranceOwnedPeriod).mockRejectedValue(new Error("synthetic failure"));
  render(<HrInsuranceOwnedPeriodsClient />); const form = await fill(); fireEvent.click(form.getByRole("button", { name: "生成期间预览" })); await form.findByRole("alert"); fireEvent.click(form.getByRole("button", { name: "生成期间预览" })); await form.findByLabelText("待确认预览");
  const previews = vi.mocked(hrApi.createInsuranceOwnedPreview).mock.calls; expect(previews[0]![0]).toEqual(previews[1]![0]); expect(previews[0]![2]).toBe(previews[1]![2]);
  fireEvent.change(form.getByLabelText("操作依据"), { target: { value: "合成核对" } }); fireEvent.click(form.getByRole("button", { name: "确认期间" })); await form.findByRole("alert"); await waitFor(() => expect(form.getByRole("button", { name: "确认期间" })).toBeEnabled()); fireEvent.click(form.getByRole("button", { name: "确认期间" })); await waitFor(() => expect(hrApi.confirmInsuranceOwnedPeriod).toHaveBeenCalledTimes(2));
  const confirms = vi.mocked(hrApi.confirmInsuranceOwnedPeriod).mock.calls; expect(confirms[0]![0]).toEqual(confirms[1]![0]); expect(confirms[0]![2]).toBe(confirms[1]![2]);
  await waitFor(() => expect(form.getByLabelText("核算月份")).toBeEnabled()); fireEvent.change(form.getByLabelText("核算月份"), { target: { value: "2026-11" } }); expect(form.queryByLabelText("待确认预览")).toBeNull();
});
it("pending writes block parent switching; revocation aborts and suppresses late results", async () => {
  let resolve!: (value: HrInsuranceOwnedPreview & { replayed: boolean }) => void; vi.mocked(hrApi.createInsuranceOwnedPreview).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<HrInsuranceOwnedPeriodsClient />); const form = await fill(); fireEvent.click(form.getByRole("button", { name: "生成期间预览" })); expect(screen.getByRole("button", { name: "新建期间" })).toBeDisabled(); expect(screen.getByRole("button", { name: "搜索期间" })).toBeDisabled();
  const signal = vi.mocked(hrApi.createInsuranceOwnedPreview).mock.calls[0]![3]!; state.user.permissions = []; view.rerender(<HrInsuranceOwnedPeriodsClient />); expect(signal.aborted).toBe(true); await act(async () => resolve({ ...preview, replayed: false })); expect(screen.queryByLabelText("待确认预览")).toBeNull();
});
it("close retries preserve identity and successful receipt survives optional list refresh failure", async () => {
  vi.mocked(hrApi.insuranceOwnedPeriods).mockResolvedValue({ items: [period], total: 1, page: 1, page_size: 20 }); vi.mocked(hrApi.closeInsuranceOwnedPeriod).mockRejectedValueOnce(new Error("synthetic failure"));
  render(<HrInsuranceOwnedPeriodsClient />); fireEvent.click(await screen.findByRole("button", { name: "查看期间" })); const detail = within(await screen.findByLabelText("现代期间详情")); fireEvent.change(detail.getByLabelText("关账依据"), { target: { value: "合成关账" } }); fireEvent.click(detail.getByRole("button", { name: "关账" })); await screen.findByRole("alert"); await waitFor(() => expect(detail.getByRole("button", { name: "关账" })).toBeEnabled());
  vi.mocked(hrApi.insuranceOwnedPeriods).mockRejectedValue(new Error("synthetic refresh failure")); fireEvent.click(detail.getByRole("button", { name: "关账" })); expect(await screen.findByText("2026-10 · 版本 1 已关账")).toBeVisible(); await screen.findByRole("alert"); expect(screen.getByText("2026-10 · 版本 1 已关账")).toBeVisible(); const calls = vi.mocked(hrApi.closeInsuranceOwnedPeriod).mock.calls; expect(calls[0]![0]).toEqual(calls[1]![0]); expect(calls[0]![2]).toBe(calls[1]![2]);
});
it("closed current period correction binds predecessor and fixed month with a fresh preview", async () => {
  const closed = { ...period, status: "closed" as const }; vi.mocked(hrApi.insuranceOwnedPeriods).mockResolvedValue({ items: [closed], total: 1, page: 1, page_size: 20 }); vi.mocked(hrApi.insuranceOwnedPeriod).mockResolvedValue(closed);
  render(<HrInsuranceOwnedPeriodsClient />); fireEvent.click(await screen.findByRole("button", { name: "查看期间" })); fireEvent.click(await screen.findByRole("button", { name: "更正期间" })); const form = await fill(true); expect(form.getByLabelText("核算月份")).toBeDisabled(); expect(hrApi.insuranceOwnedEmployees).toHaveBeenCalledWith("synthetic-token", 1, employee.employeeCode, expect.any(AbortSignal));
  fireEvent.click(form.getByRole("button", { name: "生成期间预览" })); await form.findByLabelText("待确认预览"); fireEvent.change(form.getByLabelText("操作依据"), { target: { value: "合成更正" } }); fireEvent.click(form.getByRole("button", { name: "确认更正" })); expect(await screen.findByText("2026-10 · 版本 2 已确认")).toBeVisible(); expect(hrApi.correctInsuranceOwnedPeriod).toHaveBeenCalledWith(expect.objectContaining({ previousRevisionId: period.id, expectedPeriodVersion: 1, expectedPreviewHash: preview.previewHash }), "synthetic-token", expect.any(String), expect.any(AbortSignal));
});
it("closed correction carries reordered six exact original bases and an explicit fund choice while requiring fresh employee and policy", async () => {
  const exactBases = ["9007199254740991.01", "2.30", "3.40", "4.50", "5.60", "6.70"];
  const closed = { ...period, status: "closed" as const, calculation: { ...calculation, includeFund: true, items: [...kinds].reverse().map((insuranceKind, index) => ({ ...calculation.items[index]!, insuranceKind, contributionBase: exactBases[kinds.indexOf(insuranceKind)]! })) } };
  vi.mocked(hrApi.insuranceOwnedPeriods).mockResolvedValue({ items: [closed], total: 1, page: 1, page_size: 20 }); vi.mocked(hrApi.insuranceOwnedPeriod).mockResolvedValue(closed);
  render(<HrInsuranceOwnedPeriodsClient />); fireEvent.click(await screen.findByRole("button", { name: "查看期间" })); fireEvent.click(await screen.findByRole("button", { name: "更正期间" })); const form = await screen.findByLabelText("更正社保期间");
  expect(within(form).getByLabelText("公积金汇总")).toHaveValue("include"); expect(within(form).getAllByRole("spinbutton").map(input => (input as HTMLInputElement).value)).toEqual(exactBases); expect(within(form).getByText(/仍须明确选择员工和政策版本/)).toBeVisible();
  expect(within(form).getByLabelText("员工")).toHaveValue(""); expect(within(form).getByLabelText("政策版本")).toHaveValue("");
});
it("incomplete original correction warns without guessing and new creation remains empty", async () => {
  const incomplete = { ...period, status: "closed" as const, calculation: { ...calculation, includeFund: undefined as unknown as boolean, items: [...calculation.items.slice(0, 4), { ...calculation.items[0]!, contributionBase: "bad" }] } };
  vi.mocked(hrApi.insuranceOwnedPeriods).mockResolvedValue({ items: [incomplete], total: 1, page: 1, page_size: 20 }); vi.mocked(hrApi.insuranceOwnedPeriod).mockResolvedValue(incomplete);
  render(<HrInsuranceOwnedPeriodsClient />); fireEvent.click(await screen.findByRole("button", { name: "查看期间" })); fireEvent.click(await screen.findByRole("button", { name: "更正期间" })); const correction = await screen.findByLabelText("更正社保期间");
  expect(within(correction).getByRole("alert")).toHaveTextContent(/原记录输入不完整/); expect(within(correction).getByLabelText("公积金汇总")).toHaveValue(""); expect(within(correction).getAllByRole("spinbutton").some(input => (input as HTMLInputElement).value === "")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "新建期间" })); const fresh = await screen.findByLabelText("新建社保期间"); expect(within(fresh).getByLabelText("公积金汇总")).toHaveValue(""); expect(within(fresh).getAllByRole("spinbutton").every(input => (input as HTMLInputElement).value === "")).toBe(true);
});
it("incomplete original detail stays readable and withholds its amount comparison", async () => {
  const incomplete = { ...period, status: "closed" as const, calculation: { ...calculation, items: undefined as unknown as typeof calculation.items, totals: undefined as unknown as typeof calculation.totals } };
  vi.mocked(hrApi.insuranceOwnedPeriods).mockResolvedValue({ items: [incomplete], total: 1, page: 1, page_size: 20 }); vi.mocked(hrApi.insuranceOwnedPeriod).mockResolvedValue(incomplete);
  render(<HrInsuranceOwnedPeriodsClient />); fireEvent.click(await screen.findByRole("button", { name: "查看期间" })); const detail = await screen.findByLabelText("现代期间详情"); expect(within(detail).getByRole("alert")).toHaveTextContent("核算结果不完整"); fireEvent.click(within(detail).getByRole("button", { name: "更正期间" })); const correction = await screen.findByLabelText("更正社保期间"); expect(within(correction).getByText("原金额对照不完整，需补齐原输入后再以新预览核对。")).toBeVisible();
});
it("malformed original amount text is withheld instead of appearing as a valid comparison", async () => {
  const malformed = { ...period, status: "closed" as const, calculation: { ...calculation, totals: { ...calculation.totals, employer: "not-a-decimal" } } };
  vi.mocked(hrApi.insuranceOwnedPeriods).mockResolvedValue({ items: [malformed], total: 1, page: 1, page_size: 20 }); vi.mocked(hrApi.insuranceOwnedPeriod).mockResolvedValue(malformed);
  render(<HrInsuranceOwnedPeriodsClient />); fireEvent.click(await screen.findByRole("button", { name: "查看期间" })); const detail = await screen.findByLabelText("现代期间详情"); expect(within(detail).getByRole("alert")).toHaveTextContent("核算结果不完整"); expect(within(detail).queryByText(/单位 ¥ not-a-decimal/)).toBeNull();
  fireEvent.click(within(detail).getByRole("button", { name: "更正期间" })); const correction = await screen.findByLabelText("更正社保期间"); expect(within(correction).getByRole("alert")).toHaveTextContent("核算结果不完整");
});
it("editing a correction input clears its preview while retaining the readonly original comparison", async () => {
  const closed = { ...period, status: "closed" as const }; vi.mocked(hrApi.insuranceOwnedPeriods).mockResolvedValue({ items: [closed], total: 1, page: 1, page_size: 20 }); vi.mocked(hrApi.insuranceOwnedPeriod).mockResolvedValue(closed);
  render(<HrInsuranceOwnedPeriodsClient />); fireEvent.click(await screen.findByRole("button", { name: "查看期间" })); fireEvent.click(await screen.findByRole("button", { name: "更正期间" })); const form = await fill(true);
  fireEvent.click(form.getByRole("button", { name: "生成期间预览" })); await form.findByLabelText("待确认预览"); fireEvent.change(form.getAllByRole("spinbutton")[0]!, { target: { value: "11.00" } });
  expect(form.queryByLabelText("待确认预览")).toBeNull(); expect(form.getByLabelText("原版本输入与结果")).toHaveTextContent("基数 10.00");
});
it("correction failures retain the original retry key and switching closed targets resets the carried draft", async () => {
  const second = { ...period, id: "second-revision", periodMonth: "2026-11", revisionNo: 4, employeeCode: "SYN-2", calculation: { ...calculation, includeFund: true, items: kinds.map((insuranceKind, index) => ({ ...calculation.items[index]!, insuranceKind, contributionBase: `${index + 20}.00` })) } };
  const first = { ...period, status: "closed" as const }; const closedSecond = { ...second, status: "closed" as const };
  vi.mocked(hrApi.insuranceOwnedPeriods).mockResolvedValue({ items: [first, closedSecond], total: 2, page: 1, page_size: 20 }); vi.mocked(hrApi.insuranceOwnedPeriod).mockImplementation(id => Promise.resolve(id === second.id ? closedSecond : first)); vi.mocked(hrApi.correctInsuranceOwnedPeriod).mockRejectedValueOnce(new Error("synthetic failure"));
  render(<HrInsuranceOwnedPeriodsClient />); fireEvent.click(await screen.findAllByRole("button", { name: "查看期间" }).then(buttons => buttons[0]!)); fireEvent.click(await screen.findByRole("button", { name: "更正期间" })); const firstForm = await fill(true);
  fireEvent.click(firstForm.getByRole("button", { name: "生成期间预览" })); await firstForm.findByLabelText("待确认预览"); fireEvent.change(firstForm.getByLabelText("操作依据"), { target: { value: "保留重试" } }); fireEvent.click(firstForm.getByRole("button", { name: "确认更正" })); await firstForm.findByRole("alert"); fireEvent.click(firstForm.getByRole("button", { name: "确认更正" })); await waitFor(() => expect(hrApi.correctInsuranceOwnedPeriod).toHaveBeenCalledTimes(2));
  const retries = vi.mocked(hrApi.correctInsuranceOwnedPeriod).mock.calls; expect(retries[0]![0]).toEqual(retries[1]![0]); expect(retries[0]![2]).toBe(retries[1]![2]); fireEvent.click(screen.getAllByRole("button", { name: "查看期间" })[1]!); fireEvent.click(await screen.findByRole("button", { name: "更正期间" })); const secondForm = await screen.findByLabelText("更正社保期间");
  expect(within(secondForm).getByLabelText("核算月份")).toHaveValue("2026-11"); expect(within(secondForm).getByLabelText("公积金汇总")).toHaveValue("include"); expect((within(secondForm).getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("20.00");
});
