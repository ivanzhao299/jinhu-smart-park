import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,it,expect,vi} from "vitest";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {DepartureApplicationsPanel} from "../../app/hr/lifecycle/DepartureApplicationsPanel";
import {DepartureEmployeePicker} from "../../app/hr/lifecycle/DepartureEmployeePicker";
import {hrApi,type HrDepartureEmployeeOptions,type HrDepartureApplication} from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"actor",permissions:["hr:departure:read","hr:departure:manage","hr:departure:handover"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{departureApplications:vi.fn(),departureEmployeeOptions:vi.fn(),createDepartureApplication:vi.fn(),updateDepartureApplication:vi.fn(),recordDepartureHandover:vi.fn()}}));
const option=(n:number)=>({id:`employee-${n}`,employeeName:`员工${n}`,employeeCode:`E${n}`,orgId:null,orgName:null,employmentStatus:"active"});
const response=(n=1,total=620):HrDepartureEmployeeOptions=>({items:[option(n)],page:1,page_size:20,total,selected:null});
const row=(status="draft"):HrDepartureApplication=>({version:1,id:`application-${status}`,employeeId:"employee-601",employeeName:"员工601",employeeCode:"E601",applicationName:"保留名称",reason:"原原因",status,applicationNo:"LZ2026100001",applicationDate:"2026-10-01",plannedDepartureDate:"2026-10-08",departureType:"主动离职",orgName:null,interviewStatus:"pending",surveyStatus:"pending",handoverStatus:"pending",wageStatus:"pending",archiveStatus:"open",appliedAt:null});
beforeEach(()=>{vi.resetAllMocks();state.user={id:"actor",permissions:[HR_PERMISSIONS.HR_DEPARTURE_READ,HR_PERMISSIONS.HR_DEPARTURE_MANAGE,HR_PERMISSIONS.HR_DEPARTURE_HANDOVER]};vi.mocked(hrApi.departureApplications).mockResolvedValue({items:[row(),row("approved")],total:2,page:1,page_size:50});vi.mocked(hrApi.departureEmployeeOptions).mockImplementation(async(_purpose,page,keyword)=>({...response(keyword?601:page===2?21:1),page:page??1}));});
describe("departure employee selection continuity",()=>{
 it("preserves the bound off-page employee and the entire failed edit draft",async()=>{
  vi.mocked(hrApi.updateDepartureApplication).mockRejectedValue(new Error("保存失败"));render(<DepartureApplicationsPanel/>);
  fireEvent.click(await screen.findByRole("button",{name:"修改"}));
  const employee=screen.getByRole("combobox",{name:"员工"});expect(employee).toHaveValue("employee-601");
  fireEvent.change(screen.getByLabelText("员工搜索"),{target:{value:"other"}});await waitFor(()=>expect(hrApi.departureEmployeeOptions).toHaveBeenLastCalledWith("application",1,"other","synthetic-token",expect.any(AbortSignal),undefined,undefined));
  fireEvent.change(screen.getByLabelText("离职原因"),{target:{value:"失败也保留的原因"}});fireEvent.click(screen.getByRole("button",{name:"保存修改"}));
  await screen.findByRole("alert");expect(employee).toHaveValue("employee-601");expect(screen.getByLabelText("离职原因")).toHaveValue("失败也保留的原因");expect(screen.getByLabelText("申请名称")).toHaveValue("保留名称");
  expect(hrApi.updateDepartureApplication).toHaveBeenCalledWith("application-draft",expect.objectContaining({employeeId:"employee-601",reason:"失败也保留的原因"}),"synthetic-token",expect.any(String));
 });
 it("searches beyond 500 and retains the chosen original id after paging",async()=>{
  render(<DepartureEmployeePicker purpose="application" name="employeeId" label="员工"/>);await screen.findByRole("option",{name:"员工1 · E1"});
  fireEvent.change(screen.getByLabelText("员工搜索"),{target:{value:"E601"}});await screen.findByRole("option",{name:"员工601 · E601"});fireEvent.change(screen.getByRole("combobox"),{target:{value:"employee-601"}});
  fireEvent.change(screen.getByLabelText("员工搜索"),{target:{value:""}});await screen.findByRole("option",{name:"员工1 · E1"});fireEvent.click(screen.getByRole("button",{name:"下一批"}));await screen.findByRole("option",{name:"员工21 · E21"});expect(screen.getByRole("combobox")).toHaveValue("employee-601");
 });
 it("ignores stale replies and does not restore an explicitly cleared route selection",async()=>{
  let resolveOld!:(value:HrDepartureEmployeeOptions)=>void;
  vi.mocked(hrApi.departureEmployeeOptions).mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue({...response(601),selected:option(601)});
  render(<DepartureEmployeePicker purpose="application" name="employeeId" label="员工" initialId="employee-601"/>);
  fireEvent.change(screen.getByLabelText("员工搜索"),{target:{value:"E601"}});await waitFor(()=>expect(screen.getByRole("combobox")).toHaveValue("employee-601"));
  resolveOld(response(1));await waitFor(()=>expect(screen.queryByRole("option",{name:"员工1 · E1"})).toBeNull());
  fireEvent.change(screen.getByRole("combobox"),{target:{value:""}});fireEvent.change(screen.getByLabelText("员工搜索"),{target:{value:"again"}});await waitFor(()=>expect(hrApi.departureEmployeeOptions).toHaveBeenCalledTimes(3));expect(screen.getByRole("combobox")).toHaveValue("");
 });
 it("handover-only action users load independent candidates excluding the subject and preserve failed notes",async()=>{
  state.user.permissions=[HR_PERMISSIONS.HR_DEPARTURE_TEAM_READ,HR_PERMISSIONS.HR_DEPARTURE_HANDOVER];vi.mocked(hrApi.recordDepartureHandover).mockRejectedValue(new Error("交接失败"));
  render(<DepartureApplicationsPanel/>);fireEvent.click(await screen.findByRole("button",{name:"办理清场"}));await screen.findByRole("option",{name:"员工1 · E1"});
  expect(screen.queryByLabelText("员工搜索")).toBeNull();expect(hrApi.departureEmployeeOptions).toHaveBeenCalledWith("handover",1,"","synthetic-token",expect.any(AbortSignal),undefined,"employee-601");
  fireEvent.change(screen.getByLabelText("接交员工"),{target:{value:"employee-1"}});fireEvent.change(screen.getByLabelText("交接说明"),{target:{value:"必须保留的交接说明"}});fireEvent.click(screen.getByRole("button",{name:"确认"}));await screen.findByRole("alert");expect(screen.getByLabelText("交接说明")).toHaveValue("必须保留的交接说明");expect(screen.getByLabelText("接交员工")).toHaveValue("employee-1");
 });

 it("application and handover choices stay independent and failed creation preserves employee beyond 500",async()=>{
  vi.mocked(hrApi.createDepartureApplication).mockRejectedValue(new Error("创建失败"));render(<DepartureApplicationsPanel/>);
  await screen.findByRole("option",{name:"员工1 · E1"});fireEvent.change(screen.getByLabelText("员工搜索"),{target:{value:"E601"}});await screen.findByRole("option",{name:"员工601 · E601"});fireEvent.change(screen.getByLabelText("员工"),{target:{value:"employee-601"}});
  fireEvent.click(screen.getByRole("button",{name:"办理清场"}));await screen.findByRole("option",{name:"员工1 · E1"});fireEvent.change(screen.getByLabelText("接交员工"),{target:{value:"employee-1"}});
  expect(screen.getByLabelText("员工")).toHaveValue("employee-601");expect(screen.getByLabelText("接交员工")).toHaveValue("employee-1");
  fireEvent.change(screen.getByLabelText("离职原因"),{target:{value:"新申请原因"}});fireEvent.click(screen.getByRole("button",{name:"保存申请草稿"}));await screen.findByRole("alert");
  expect(hrApi.createDepartureApplication).toHaveBeenCalledWith(expect.objectContaining({employeeId:"employee-601",reason:"新申请原因"}),"synthetic-token",expect.any(String));expect(screen.getByLabelText("员工")).toHaveValue("employee-601");expect(screen.getByLabelText("离职原因")).toHaveValue("新申请原因");expect(screen.getByLabelText("接交员工")).toHaveValue("employee-1");
 });
 it("no departure scope exposes no picker or generic employee query",async()=>{state.user.permissions=[HR_PERMISSIONS.HR_DEPARTURE_SELF_READ,HR_PERMISSIONS.HR_DEPARTURE_MANAGE];render(<DepartureApplicationsPanel/>);await screen.findByText("离职申请与清场");expect(hrApi.departureEmployeeOptions).not.toHaveBeenCalled();expect(screen.queryByLabelText("员工搜索")).toBeNull();});
});
