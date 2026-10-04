import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HrEmployeesClient } from "../../app/hr/employees/HrEmployeesClient";
import { ApiError } from "../../lib/api-client";
import { hrApi, type HrEmployee, type HrEmployeeProfile } from "../../lib/hr-api";

vi.mock("../../lib/hr-api", () => ({ hrApi: { employees: vi.fn(), employee: vi.fn(), profile: vi.fn(), customValues: vi.fn(), updateCustomValue: vi.fn(), updateProfile: vi.fn() } }));
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
  id: `profile-${employeeId}`, version: 7, employeeId, highestEducation: "Synthetic education", masked,
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
  vi.mocked(hrApi.customValues).mockReset().mockImplementation(async employeeId => ({employeeId,fields:[]}));
  vi.mocked(hrApi.profile).mockReset(); vi.mocked(hrApi.updateProfile).mockReset();
});

describe("employee profile read admission", () => {
  it("loads maintainable custom fields for an employee with no basic profile", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue(null);
    vi.mocked(hrApi.customValues).mockResolvedValue({employeeId:"alpha",fields:[{definitionId:"def-id",version:0,code:"def1",label:"Synthetic extension",valueType:"text",group:null,sortOrder:0,value:null,sourceValid:true}]});
    render(<HrEmployeesClient />); await openFirst();
    expect(await screen.findByRole("form",{name:"维护Synthetic extension"})).toBeInTheDocument();
    expect(hrApi.customValues).toHaveBeenCalledWith("alpha","synthetic-test-token",expect.any(AbortSignal));
    expect(screen.getByRole("button",{name:"保存字段"})).not.toBeDisabled();
  });
  it("rejects another employee's custom values when the basic profile is absent", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue(null);
    vi.mocked(hrApi.customValues).mockResolvedValue({employeeId:"foreign",fields:[{definitionId:"foreign-def",version:0,code:"def1",label:"Foreign extension",valueType:"text",group:null,sortOrder:0,value:"foreign private",sourceValid:true}]});
    render(<HrEmployeesClient />); await openFirst();
    await screen.findByText("扩展档案加载失败，请重新加载员工详情。");
    expect(screen.queryByText("foreign private")).toBeNull();
    expect(screen.queryByRole("button",{name:"保存字段"})).toBeNull();
  });

  it("keeps the exact employee archive link behind its existing read permission", async () => {
    auth.permissions.push("hr:legacy_archive:read");
    vi.mocked(hrApi.profile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    const provenance=screen.getByText("资料来源与沿革").closest("details")!;
    const link=within(provenance).getByRole("link",{name:"查看档案沿革",hidden:true});
    expect(link).toHaveAttribute("href","/hr/employees/legacy?employee_id=alpha");
    expect(provenance).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "档案沿革" })).toHaveAttribute("href", "/hr/employees/legacy");
    expect(screen.queryByText("旧系统资料")).toBeNull();
  });
  it("clears the identity explicitly for an imported employee without changing current employment", async () => {
    vi.mocked(hrApi.employee).mockResolvedValue({ ...employee(), legacyJobstateCode: "A", legacyJobstateName: "原状态" });
    vi.mocked(hrApi.profile).mockResolvedValue({ ...profile(), idType: "passport", idNumber: "SYN-PASSPORT-001" });
    vi.mocked(hrApi.updateProfile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.getByLabelText("证件号（加密保存）")).toHaveValue("SYN-PASSPORT-001");
    const provenance=screen.getByText("资料来源与沿革").closest("details")!;
    expect(provenance).not.toHaveAttribute("open");
    expect(within(provenance).getByText("原状态")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看档案沿革" })).toBeNull();
    expect(screen.queryByText(/玉舟基础档案|玉舟历史兼容|旧系统资料/)).toBeNull();
    fireEvent.change(screen.getByLabelText("证件号（加密保存）"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: "保存敏感档案" }).closest("form")!);
    await waitFor(() => expect(hrApi.updateProfile).toHaveBeenCalledWith("alpha", expect.objectContaining({expectedVersion:7,idNumber:"",idType:"passport"}),"synthetic-test-token"));
    expect(screen.getByText(/当前状态：在职/)).toBeInTheDocument();
  });
  it("preserves the loaded identity when saving another field", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue({ ...profile(), idType: "passport", idNumber: "SYN-PASSPORT-001" });
    vi.mocked(hrApi.updateProfile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    fireEvent.change(screen.getByLabelText("档案备注"), {target:{value:"Edited note"}});
    fireEvent.submit(screen.getByRole("button", {name:"保存敏感档案"}).closest("form")!);
    await waitFor(()=>expect(hrApi.updateProfile).toHaveBeenCalledWith("alpha",expect.objectContaining({idNumber:"SYN-PASSPORT-001",remark:"Edited note",expectedVersion:7}),"synthetic-test-token"));
  });
  it("carries edits for all 33 fixed business fields through the real maintenance form", async () => {
    const expected={idType:"passport",idNumber:"SYN-PASSPORT-002",englishName:"Changed name",gender:"男",dateOfBirth:"1990-02-03",ethnicity:"民族",nativePlace:"籍贯",politicalStatus:"政治面貌",partyJoinDate:"2015-03-04",heightCm:173,weightKg:68,maritalStatus:"婚姻状况",healthStatus:"健康状况",householdRegistration:"户口所在地",highestEducation:"最高学历",major:"专业",degree:"学位",foreignLanguage:"外语",languageLevel:"外语水平",graduationDate:"2013-07-01",graduationSchool:"学校",homePhone:"SYN-HOME",jobTitle:"职务",jobGrade:"级别",employeeCategory:"类别",technicalTitle:"职称",technicalGrade:"职称级别",personalMobile:"SYN-MOBILE",personalEmail:"changed@example.invalid",address:"地址",emergencyContactName:"联系人",emergencyContactMobile:"SYN-CONTACT",remark:"备注"};
    expect(Object.keys(expected)).toHaveLength(33);
    vi.mocked(hrApi.profile).mockResolvedValue(profile());
    vi.mocked(hrApi.updateProfile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    const form=screen.getByRole("button",{name:"保存敏感档案"}).closest("form")!;
    for(const [name,value] of Object.entries(expected)){
      const control=form.elements.namedItem(name);
      expect(control,`editable control for ${name}`).not.toBeNull();
      expect(control).not.toHaveAttribute("readonly");
      expect(control).not.toBeDisabled();
      fireEvent.change(control as HTMLInputElement,{target:{value:String(value)}});
    }
    fireEvent.submit(form);
    await waitFor(()=>expect(hrApi.updateProfile).toHaveBeenCalledWith("alpha",{...expected,expectedVersion:7},"synthetic-test-token"));
  });
  it("rejects missing read versions instead of assuming the latest", async () => {
    vi.mocked(hrApi.profile).mockResolvedValue({ ...profile(), version: undefined } as unknown as HrEmployeeProfile);
    render(<HrEmployeesClient />); await openFirst();
    expect(screen.queryByRole("button", { name: "保存敏感档案" })).toBeNull();
    expect(hrApi.updateProfile).not.toHaveBeenCalled();
  });
  it("sends zero only after a successful absent-profile read", async () => {
    vi.mocked(hrApi.profile).mockResolvedValueOnce(null).mockResolvedValue(profile());
    vi.mocked(hrApi.updateProfile).mockResolvedValue(profile());
    render(<HrEmployeesClient />); await openFirst();
    fireEvent.submit(screen.getByRole("button", { name: "保存敏感档案" }).closest("form")!);
    await waitFor(() => expect(hrApi.updateProfile).toHaveBeenCalledWith("alpha", expect.objectContaining({ expectedVersion: 0 }), "synthetic-test-token"));
  });
  it("retains edits after 409, blocks retries, and requires explicit discard/reload", async () => {
    vi.mocked(hrApi.profile).mockResolvedValueOnce(profile()).mockResolvedValue({ ...profile(), version: 8, highestEducation: "Latest saved value" });
    vi.mocked(hrApi.updateProfile).mockRejectedValueOnce(new ApiError("stale", 409)).mockResolvedValue({ ...profile(), version: 9 });
    render(<HrEmployeesClient />); await openFirst();
    fireEvent.change(screen.getByLabelText("最高学历"), { target: { value: "My unsaved edit" } });
    const form = screen.getByRole("button", { name: "保存敏感档案" }).closest("form")!;
    fireEvent.submit(form);
    await screen.findByText("档案已被更新，当前编辑内容已保留。请先核对或复制您的修改，再重新加载最新档案后保存。");
    expect(screen.getByLabelText("最高学历")).toHaveValue("My unsaved edit");
    expect(hrApi.updateProfile).toHaveBeenCalledWith("alpha", expect.objectContaining({ expectedVersion: 7, highestEducation: "My unsaved edit" }), "synthetic-test-token");
    expect(screen.getByRole("button", { name: "保存敏感档案" })).toBeDisabled();
    fireEvent.submit(form);
    expect(hrApi.updateProfile).toHaveBeenCalledTimes(1);
    expect(hrApi.profile).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "放弃本次编辑并重新加载" }));
    await waitFor(() => expect(screen.getByLabelText("最高学历")).toHaveValue("Latest saved value"));
    fireEvent.submit(screen.getByRole("button", { name: "保存敏感档案" }).closest("form")!);
    await waitFor(() => expect(hrApi.updateProfile).toHaveBeenLastCalledWith("alpha", expect.objectContaining({ expectedVersion: 8 }), "synthetic-test-token"));
  });
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

describe("current assignment detail",()=>{
 it("shows authorized business labels and source-separated employment dates without internal relationship IDs",async()=>{
  vi.mocked(hrApi.profile).mockResolvedValue(null);
  vi.mocked(hrApi.employee).mockResolvedValue({...employee(),primaryOrgId:"INTERNAL-ORG-ID",positionId:"INTERNAL-POSITION-ID",managerEmployeeId:"INTERNAL-MANAGER-ID",employmentDates:{unclassifiedRecordedDate:{date:"2026-10-30",status:"unclassified"},plannedConfirmation:{dates:["2026-10-31"],status:"planned"},confirmedEmployment:{dates:["2026-10-30"],status:"recorded"}},assignmentDetails:{organization:{name:"Synthetic current organization",status:"available"},position:{name:"Synthetic inactive position",status:"inactive"},manager:{name:null,status:"unavailable"}}});
  render(<HrEmployeesClient/>);await openFirst();const summary=within(screen.getByLabelText("当前任职关系"));
  expect(summary.getByText("Synthetic current organization")).toBeVisible();expect(summary.getByText("Synthetic inactive position（已停用）")).toBeVisible();expect(summary.getByText("关联信息当前不可用")).toBeVisible();expect(summary.getByText("2026-10-30（用途待核实）")).toBeVisible();expect(summary.getByText("2026-10-31")).toBeVisible();expect(summary.getByText("2026-10-30")).toBeVisible();
  for(const id of ["INTERNAL-ORG-ID","INTERNAL-POSITION-ID","INTERNAL-MANAGER-ID"])expect(summary.queryByText(id)).toBeNull();
 });
 it("does not treat an older detail response as an unassigned relationship or a date classification",async()=>{
  vi.mocked(hrApi.profile).mockResolvedValue(null);render(<HrEmployeesClient/>);await openFirst();const summary=within(screen.getByLabelText("当前任职关系"));expect(summary.getAllByText("详情尚未提供")).toHaveLength(6);expect(summary.queryByText("未关联")).toBeNull();
 });
 it("does not render an invalid saved employment date as null or unregistered",async()=>{
  vi.mocked(hrApi.profile).mockResolvedValue(null);vi.mocked(hrApi.employee).mockResolvedValue({...employee(),employmentDates:{unclassifiedRecordedDate:{date:null,status:"unclassified"},plannedConfirmation:{dates:[],status:"none"},confirmedEmployment:{dates:[],status:"none"}}});
  render(<HrEmployeesClient/>);await openFirst();const summary=within(screen.getByLabelText("当前任职关系"));expect(summary.getByText("日期格式待核实")).toBeVisible();expect(summary.queryByText("null（用途待核实）")).toBeNull();
 });
});
