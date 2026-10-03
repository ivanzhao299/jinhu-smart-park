import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HrEmployeesClient } from "../../app/hr/employees/HrEmployeesClient";
import { hrApi, type HrEmployee, type HrEmployeeProfile } from "../../lib/hr-api";

vi.mock("../../lib/hr-api", () => ({ hrApi: { employees: vi.fn(), employee: vi.fn(), profile: vi.fn(), updateProfile: vi.fn() } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-test-token" }));
const auth = vi.hoisted(() => ({ permissions: ["hr:employees", "hr:employee:read", "hr:employee_profile:manage"] }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => ({ id: "synthetic-user", permissions: auth.permissions }) }));
vi.mock("../../components/auth/PermissionGuard", () => ({ PermissionGuard: ({ children }: {children: React.ReactNode}) => children }));

const employee = (id = "alpha"): HrEmployee => ({
  id, employeeCode: `SYN-${id}`, fullName: `Synthetic ${id}`, userId: null, primaryOrgId: null,
  positionId: null, managerEmployeeId: null, employmentType: "full_time", employmentStatus: "active",
  legacyJobstateCode: null, legacyJobstateName: null, hireDate: "2020-01-01", departureDate: null,
  workLocation: null, workMobile: null, workEmail: null,
});
const profile = (employeeId = "alpha", masked = false): HrEmployeeProfile => ({
  id: `profile-${employeeId}`, employeeId, highestEducation: "Synthetic education", masked,
  idType: null, idNumberMasked: null, jobTitle: employeeId === "foreign" ? "Synthetic foreign title" : null, jobGrade: null, employeeCategory: null,
  technicalTitle: null, technicalGrade: null, personalMobile: null, personalEmail: null,
  address: null, emergencyContactName: null, emergencyContactMobile: null, remark: "Synthetic existing note",
});
async function openFirst() {
  await waitFor(() => expect(screen.getAllByRole("button", { name: "查看档案" }).length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByRole("button", { name: "查看档案" })[0]!);
  await screen.findByRole("heading", { name: "Synthetic alpha · 员工详情" });
}

beforeEach(() => {
  auth.permissions = ["hr:employees", "hr:employee:read", "hr:employee_profile:manage"];
  vi.mocked(hrApi.employees).mockReset().mockResolvedValue({ items: [employee()], total: 1, page: 1, page_size: 50 });
  vi.mocked(hrApi.employee).mockReset().mockImplementation(async id => employee(id));
  vi.mocked(hrApi.profile).mockReset(); vi.mocked(hrApi.updateProfile).mockReset();
});

describe("employee profile read admission", () => {
  it("does not expose a blank replacement form after a failed read", async () => {
    vi.mocked(hrApi.profile).mockRejectedValue(new Error("synthetic unavailable"));
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.queryByRole("button", { name: "保存敏感档案" })).toBeNull();
    expect(screen.getByRole("button", { name: "重新加载档案" })).toBeEnabled();
    expect(hrApi.updateProfile).not.toHaveBeenCalled();
  });
  it("permits a genuinely absent profile only after a successful retry", async () => {
    vi.mocked(hrApi.profile).mockRejectedValueOnce(new Error("synthetic unavailable")).mockResolvedValueOnce(null);
    render(<HrEmployeesClient />); await openFirst();
    fireEvent.click(screen.getByRole("button", { name: "重新加载档案" }));
    expect(await screen.findByRole("button", { name: "保存敏感档案" })).toBeEnabled();
    expect(hrApi.profile).toHaveBeenCalledTimes(2);
  });
  it("loads an editable full profile and retains its current field value", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByLabelText("最高学历")).toHaveValue("Synthetic education");
    expect(screen.getByRole("button", { name: "保存敏感档案" })).toBeEnabled();
  });
  it("does not admit a masked or different employee profile for editing", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue(profile("alpha", true));
    const view = render(<HrEmployeesClient />); await openFirst();
    expect(screen.queryByRole("button", { name: "保存敏感档案" })).toBeNull();
    expect(screen.queryByText(/Synthetic existing note/)).toBeNull();
    expect(screen.queryByLabelText("档案备注")).toBeNull();
    view.unmount();
    vi.mocked(hrApi.profile).mockResolvedValue(profile("foreign"));
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.queryByRole("button", { name: "保存敏感档案" })).toBeNull();
    expect(screen.queryByText("Synthetic education")).toBeNull();
    expect(screen.queryByText(/Synthetic foreign title/)).toBeNull();
  });
  it("clears prior edit admission when selecting an employee whose profile fails", async () => {
    vi.mocked(hrApi.employees).mockResolvedValue({ items: [employee(), employee("beta")], total: 2, page: 1, page_size: 50 });
    vi.mocked(hrApi.profile).mockResolvedValueOnce(profile()).mockRejectedValueOnce(new Error("synthetic unavailable"));
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByRole("button", { name: "保存敏感档案" })).toBeEnabled();
    fireEvent.click(screen.getAllByRole("button", { name: "查看档案" })[1]!);
    await screen.findByRole("heading", { name: "Synthetic beta · 员工详情" });
    expect(screen.queryByRole("button", { name: "保存敏感档案" })).toBeNull();
    expect(hrApi.updateProfile).not.toHaveBeenCalled();
  });
  it("removes edit admission when a successful save cannot be read back", async () => {
    vi.mocked(hrApi.profile).mockResolvedValueOnce(profile()).mockRejectedValueOnce(new Error("synthetic readback unavailable"));
    vi.mocked(hrApi.updateProfile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    fireEvent.submit(screen.getByRole("button", { name: "保存敏感档案" }).closest("form")!);
    await screen.findByText("档案已保存，但重新读取失败，请重新加载。");
    expect(hrApi.updateProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "保存敏感档案" })).toBeNull();
    expect(screen.getByRole("button", { name: "重新加载档案" })).toBeEnabled();
  });
  it("requires reload when a successful save reads back only a masked profile", async () => {
    vi.mocked(hrApi.profile).mockResolvedValueOnce(profile()).mockResolvedValueOnce(profile("alpha", true));
    vi.mocked(hrApi.updateProfile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    fireEvent.submit(screen.getByRole("button", { name: "保存敏感档案" }).closest("form")!);
    await screen.findByText("档案已保存，请重新加载后再维护。");
    expect(hrApi.updateProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "保存敏感档案" })).toBeNull();
    expect(screen.getByRole("button", { name: "重新加载档案" })).toBeEnabled();
  });

  it("retains an existing profile remark when saving another field", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue(profile());
    vi.mocked(hrApi.updateProfile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByLabelText("档案备注")).toHaveValue("Synthetic existing note");
    fireEvent.change(screen.getByLabelText("最高学历"), { target: { value: "Synthetic updated education" } });
    fireEvent.submit(screen.getByRole("button", { name: "保存敏感档案" }).closest("form")!);
    await waitFor(() => expect(hrApi.updateProfile).toHaveBeenCalledWith("alpha", expect.objectContaining({ highestEducation: "Synthetic updated education", remark: "Synthetic existing note" }), "synthetic-test-token"));
  });
  it("submits an edited remark with the backend length limit", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue(profile());
    vi.mocked(hrApi.updateProfile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByLabelText("档案备注")).toHaveAttribute("maxlength", "500");
    fireEvent.change(screen.getByLabelText("档案备注"), { target: { value: "Synthetic amended note" } });
    fireEvent.submit(screen.getByRole("button", { name: "保存敏感档案" }).closest("form")!);
    await waitFor(() => expect(hrApi.updateProfile).toHaveBeenCalledWith("alpha", expect.objectContaining({ remark: "Synthetic amended note" }), "synthetic-test-token"));
  });
  it("allows deliberately clearing a remark through the existing replacement API", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue(profile());
    vi.mocked(hrApi.updateProfile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    fireEvent.change(screen.getByLabelText("档案备注"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: "保存敏感档案" }).closest("form")!);
    await waitFor(() => expect(hrApi.updateProfile).toHaveBeenCalledWith("alpha", expect.objectContaining({ remark: undefined }), "synthetic-test-token"));
  });

});


describe("full profile readonly carriage", () => {
  it("renders an explicitly supplied full API projection without adding a maintenance requirement", async () => {
    auth.permissions = ["hr:employees", "hr:employee:read", "hr:employee_profile:read"];
    vi.mocked(hrApi.profile).mockResolvedValue({ ...profile(), dateOfBirth: "1990-02-03" });
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByText("Synthetic education")).toBeVisible();
    expect(screen.getByText("1990-02-03")).toBeVisible();
    expect(screen.queryByRole("button", { name: "保存敏感档案" })).toBeNull();
    expect(screen.queryByLabelText("最高学历")).toBeNull();
    expect(hrApi.updateProfile).not.toHaveBeenCalled();
  });
  it("keeps an ordinary profile reader's masked API response limited to the existing summary", async () => {
    auth.permissions = ["hr:employees", "hr:employee:read", "hr:employee_profile:read"];
    vi.mocked(hrApi.profile).mockResolvedValue(profile("alpha", true));
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByText("受保护档案（已脱敏）")).toBeVisible();
    expect(screen.queryByText("Synthetic education")).toBeNull();
    expect(screen.queryByText(/Synthetic existing note/)).toBeNull();
    expect(screen.queryByRole("button", { name: "保存敏感档案" })).toBeNull();
  });
  it("clears full readonly values when a subsequent employee read fails", async () => {
    auth.permissions = ["hr:employees", "hr:employee:read", "hr:employee_profile:read"];
    vi.mocked(hrApi.employees).mockResolvedValue({ items: [employee(), employee("beta")], total: 2, page: 1, page_size: 50 });
    vi.mocked(hrApi.profile).mockResolvedValueOnce(profile()).mockRejectedValueOnce(new Error("synthetic unavailable"));
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByText("Synthetic education")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "查看档案" })[1]!);
    await screen.findByRole("heading", { name: "Synthetic beta · 员工详情" });
    expect(screen.queryByText("Synthetic education")).toBeNull();
    expect(screen.queryByText(/Synthetic existing note/)).toBeNull();
  });
  it("removes prior full readonly values when the authenticated context changes", async () => {
    auth.permissions = ["hr:employees", "hr:employee:read", "hr:employee_profile:read"];
    vi.mocked(hrApi.profile).mockResolvedValue(profile());
    const view = render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByText("Synthetic education")).toBeVisible();
    auth.permissions = ["hr:employees", "hr:employee:read"];
    view.rerender(<HrEmployeesClient />);
    expect(screen.queryByText("Synthetic education")).toBeNull();
    expect(screen.queryByLabelText("员工档案详情")).toBeNull();
  });
});

describe("authorized work contact detail", () => {
  it("uses the bound detail response rather than old list contacts", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue(null);
    vi.mocked(hrApi.employees).mockResolvedValue({ items: [{...employee(), workMobile: "old-list-contact"}], total: 1, page: 1, page_size: 50 });
    vi.mocked(hrApi.employee).mockResolvedValue({...employee(), workMobile: "synthetic-current-phone", workEmail: "synthetic@example.invalid", workLocation: "Synthetic current workplace"});
    render(<HrEmployeesClient />); await openFirst();
    const summary = within(screen.getByLabelText("工作联系方式"));
    expect(summary.getByText("synthetic-current-phone")).toBeVisible();
    expect(summary.getByText("synthetic@example.invalid")).toBeVisible();
    expect(summary.getByText("Synthetic current workplace")).toBeVisible();
    expect(summary.queryByText("old-list-contact")).toBeNull();
    expect(hrApi.employee).toHaveBeenCalledTimes(1);
  });
  it("clears prior contacts when another employee detail fails", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue(null);
    vi.mocked(hrApi.employees).mockResolvedValue({ items: [employee(), employee("beta")], total: 2, page: 1, page_size: 50 });
    vi.mocked(hrApi.employee).mockResolvedValueOnce({...employee(), workMobile: "synthetic-first-contact"}).mockRejectedValueOnce(new Error("synthetic unavailable"));
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByText("synthetic-first-contact")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", {name: "查看档案"})[1]!);
    await screen.findByText("加载员工详情失败");
    expect(screen.queryByText("synthetic-first-contact")).toBeNull();
    expect(screen.queryByLabelText("工作联系方式")).toBeNull();
  });
});
