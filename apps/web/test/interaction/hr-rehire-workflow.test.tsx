import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { RehireApplicationsPanel } from "../../app/hr/lifecycle/RehireApplicationsPanel";
import { EmployeeRehireLink } from "../../app/hr/employees/EmployeeRehireLink";
import { hrApi, type HrEmployee, type HrOnboardingApplication, type HrRehireEmployeeOption, type HrRehireOptions } from "../../lib/hr-api";

const auth = vi.hoisted(() => ({ user: { id: "maker", permissions: [] as string[] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => auth.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { onboardingApplications: vi.fn(), rehireOptions: vi.fn(), createOnboardingApplication: vi.fn(), updateOnboardingApplication: vi.fn(), onboardingApplicationAction: vi.fn(), reviewOnboardingApplication: vi.fn(), confirmOnboardingApplication: vi.fn() } }));
const id = "00000000-0000-4000-8000-000000000011", org = "org", position = "position";
const employee = (employeeId = id, version = 4): HrRehireEmployeeOption => ({ id: employeeId, employeeCode: `SYN-${employeeId}`, employeeName: "Synthetic former employee", version, orgId: org, positionId: position, hireDate: "2020-01-01", departureDate: "2026-01-01" });
const options = (items: HrRehireEmployeeOption[] = [employee()], total = items.length, page = 1): HrRehireOptions => ({ items, total, page, page_size: 20, orgs: [{id:org,orgName:"Synthetic HR"}], positions: [{id:position,orgId:org,positionName:"Synthetic role"}] });
const row = (status = "draft", extra: Partial<HrOnboardingApplication> = {}): HrOnboardingApplication => ({ id: "application", entryType: "rehire", applicantUserId: "another-maker", applicationNo: "SYN-RH", applicationName: "Synthetic rehire", employeeId: id, employeeName: "Synthetic former employee", employeeCode: "SYN-1", candidateId: null, applicationDate: "2026-02-01", plannedHireDate: "2026-02-02", probationMonths: 0, attendanceCardNo: "123", status, reviewComment: null, reviewedAt: null, confirmedAt: null, remark: "Original draft", expectedEmployeeVersion: 1, targetOrgId: org, targetOrgName: "Synthetic HR", targetPositionId: position, targetPositionName: "Synthetic role", targetManagerEmployeeId: null, previousEmployment: {hire_date:"2020-01-01",departure_date:"2026-01-01"}, ...extra });
const authority = () => [HR_PERMISSIONS.HR_ONBOARDING_READ, HR_PERMISSIONS.HR_ONBOARDING_MANAGE, HR_PERMISSIONS.HR_EMPLOYEE_MANAGE, HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION];
const list = (items: HrOnboardingApplication[], total = items.length, page = 1) => ({items,total,page,page_size:20});

beforeEach(() => {
  vi.resetAllMocks(); auth.user = {id:"maker",permissions:authority()};
  vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([]));
  vi.mocked(hrApi.rehireOptions).mockImplementation(async(_token,page=1,kind="employee") => options(kind==="manager"?[]:[employee()],kind==="manager"?0:1,page));
  vi.mocked(hrApi.createOnboardingApplication).mockResolvedValue(row());
  vi.mocked(hrApi.updateOnboardingApplication).mockResolvedValue(row());
});
async function fillNew() {
  await waitFor(() => expect(screen.getByLabelText("回聘员工")).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("回聘员工"), {target:{value:id}});
  fireEvent.change(screen.getByLabelText("申请日期"), {target:{value:"2026-02-01"}});
  fireEvent.change(screen.getByLabelText("本次入职日期"), {target:{value:"2026-02-02"}});
  fireEvent.change(screen.getByLabelText("本次考勤卡号"), {target:{value:"5678"}});
}

describe("formal employee rehiring", () => {
  it("saves the selected existing employee, frozen version and explicit current assignment without candidate conversion", async () => {
    render(<RehireApplicationsPanel />); await fillNew();
    fireEvent.submit(screen.getByRole("form",{name:"新建回聘申请"}));
    await waitFor(() => expect(hrApi.createOnboardingApplication).toHaveBeenCalledWith(expect.objectContaining({entryType:"rehire",employeeId:id,expectedEmployeeVersion:4,targetOrgId:org,targetPositionId:position,targetManagerEmployeeId:null,plannedHireDate:"2026-02-02",attendanceCardNo:"5678"}),"synthetic-token"));
    expect(vi.mocked(hrApi.createOnboardingApplication).mock.calls[0]![0]).not.toHaveProperty("candidateId");
    await screen.findByText(/回聘草稿已保存/);
  });
  it("keeps entered draft values after a save failure", async () => {
    vi.mocked(hrApi.createOnboardingApplication).mockRejectedValue(new Error("Synthetic save conflict"));
    render(<RehireApplicationsPanel />); await fillNew();
    fireEvent.change(screen.getByLabelText("回聘说明"),{target:{value:"Keep this decision"}});
    fireEvent.submit(screen.getByRole("form",{name:"新建回聘申请"}));await screen.findByRole("alert");
    expect(screen.getByLabelText("本次考勤卡号")).toHaveValue("5678");expect(screen.getByLabelText("回聘说明")).toHaveValue("Keep this decision");
  });
  it("reads only this employee's rehire applications and retains the filter after paging", async () => {
    vi.mocked(hrApi.onboardingApplications).mockImplementation(async(_token,page=1)=>list([row("draft",{id:`page-${page}`,applicationName:`Page ${page}`})],43,page));
    render(<RehireApplicationsPanel employeeId={id}/>);await screen.findByText(/Page 1/);
    fireEvent.click(screen.getByRole("button",{name:"回聘下一页"}));await screen.findByText(/Page 2/);
    expect(hrApi.onboardingApplications).toHaveBeenLastCalledWith("synthetic-token",2,20,undefined,expect.any(AbortSignal),{entryType:"rehire",employeeId:id});
    expect(screen.queryByText(/Page 1/)).toBeNull();
  });
  it("does not expose a mismatched employee or initial-entry response", async () => {
    vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row("draft",{employeeId:"foreign",employeeName:"Foreign private"})]));
    render(<RehireApplicationsPanel employeeId={id}/>);await screen.findByRole("alert");expect(screen.queryByText(/Foreign private/)).toBeNull();
  });
  it("keeps employee search paging usable while preserving an already selected employee and version", async () => {
    vi.mocked(hrApi.rehireOptions).mockImplementation(async(_token,page=1,kind="employee")=>kind==="manager"?options([]):options([employee(page===1?id:"second",page===1?4:8)],43,page));
    render(<RehireApplicationsPanel/>);await fillNew();fireEvent.click(screen.getByRole("button",{name:"员工下一页"}));
    await waitFor(()=>expect(hrApi.rehireOptions).toHaveBeenCalledWith("synthetic-token",2,"employee","",expect.any(AbortSignal),undefined));
    await waitFor(()=>expect(screen.getByLabelText("回聘员工")).not.toBeDisabled());expect(screen.getByLabelText("回聘员工")).toHaveValue(id);
    fireEvent.submit(screen.getByRole("form",{name:"新建回聘申请"}));await waitFor(()=>expect(hrApi.createOnboardingApplication).toHaveBeenCalledWith(expect.objectContaining({employeeId:id,expectedEmployeeVersion:4}),"synthetic-token"));
  });
  it("refreshes a returned draft using the selected employee's current version", async () => {
    vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row("returned")]));
    render(<RehireApplicationsPanel/>);await screen.findByRole("button",{name:"修改回聘申请"});fireEvent.click(screen.getByRole("button",{name:"修改回聘申请"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"保存回聘修改"})).not.toBeDisabled());
    fireEvent.submit(screen.getByRole("form",{name:"修改回聘申请"}));await waitFor(()=>expect(hrApi.updateOnboardingApplication).toHaveBeenCalledWith("application",expect.objectContaining({expectedEmployeeVersion:4,entryType:"rehire",employeeId:id}),"synthetic-token"));
  });
  it("uses park review authority, requires a return comment and keeps maker/checker separate", async () => {
    auth.user={id:"reviewer",permissions:[HR_PERMISSIONS.HR_ONBOARDING_READ,HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW]};
    vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row("submitted")]));
    const view=render(<RehireApplicationsPanel/>);await screen.findByRole("button",{name:"批准回聘"});
    expect(screen.queryByRole("form")).toBeNull();expect(hrApi.rehireOptions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"退回回聘"}));expect(await screen.findByRole("alert")).toHaveTextContent("填写复核意见");expect(hrApi.reviewOnboardingApplication).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("复核意见（退回时必填）"),{target:{value:"Refresh current role"}});fireEvent.click(screen.getByRole("button",{name:"退回回聘"}));
    await waitFor(()=>expect(hrApi.reviewOnboardingApplication).toHaveBeenCalledWith("application","return","Refresh current role","synthetic-token"));
    auth.user={...auth.user,id:"another-maker"};view.rerender(<RehireApplicationsPanel/>);await screen.findByText(/本人提交的申请/);expect(screen.queryByRole("button",{name:"批准回聘"})).toBeNull();
  });
  it("keeps writes absent for a reader and clears the panel when read authority is removed", async () => {
    auth.user={id:"reader",permissions:[HR_PERMISSIONS.HR_ONBOARDING_READ]};vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row("approved")]));
    const view=render(<RehireApplicationsPanel/>);await screen.findByText(/已批准/);expect(screen.queryByRole("form")).toBeNull();expect(screen.queryByRole("button",{name:"确认回聘生效"})).toBeNull();
    auth.user={id:"reader",permissions:[]};view.rerender(<RehireApplicationsPanel/>);expect(screen.queryByRole("heading",{name:"离职员工回聘"})).toBeNull();expect(hrApi.onboardingApplications).toHaveBeenCalledTimes(1);expect(hrApi.rehireOptions).not.toHaveBeenCalled();
  });
  it("permits scoped approved cancellation and prevents confirmation before its date", async () => {
    vi.mocked(hrApi.onboardingApplications).mockResolvedValue(list([row("approved",{plannedHireDate:"2099-01-01"})]));
    render(<RehireApplicationsPanel/>);await screen.findByRole("button",{name:"确认回聘生效"});expect(screen.getByRole("button",{name:"确认回聘生效"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"取消回聘申请"}));await waitFor(()=>expect(hrApi.onboardingApplicationAction).toHaveBeenCalledWith("application","cancel","synthetic-token"));
  });
  it("links departed employee details to the exact rehire context without showing an entry for active employees", () => {
    const e={id,fullName:"Synthetic employee",employeeCode:"SYN-1",employmentStatus:"departed"} as HrEmployee;
    const view=render(<EmployeeRehireLink employee={e}/>);expect(screen.getByRole("link",{name:"进入该员工回聘流程"})).toHaveAttribute("href",`/hr/lifecycle?employee_id=${id}#employee-rehire`);
    view.rerender(<EmployeeRehireLink employee={{...e,employmentStatus:"active"}}/>);expect(screen.queryByRole("link")).toBeNull();
  });
});
