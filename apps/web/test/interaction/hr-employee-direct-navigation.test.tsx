import {render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HrEmployeesClient} from "../../app/hr/employees/HrEmployeesClient";
import HrEmployeesPage from "../../app/hr/employees/page";
import {parseEmployeeFilter,employeeDetailHref} from "../../app/hr/employees/employee-navigation";
import {hrApi,type HrEmployee} from "../../lib/hr-api";
import {ApiError} from "../../lib/api-client";
vi.mock("../../lib/hr-api",()=>({hrApi:{employees:vi.fn(),employee:vi.fn(),profile:vi.fn()}}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
const auth=vi.hoisted(()=>({permissions:["hr:employees","hr:employee:read"]}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>({id:"synthetic-user",permissions:auth.permissions})}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
const a="00000001-0001-4001-8001-000000000001",b="00000002-0002-4002-8002-000000000002";
const employee=(id:string):HrEmployee=>({id,employeeCode:"SYNTHETIC",fullName:id===a?"Synthetic A":"Synthetic B",userId:null,primaryOrgId:null,positionId:null,managerEmployeeId:null,employmentType:"full_time",employmentStatus:"active",legacyJobstateCode:null,legacyJobstateName:null,hireDate:null,departureDate:null,workLocation:null,workMobile:null,workEmail:null});
beforeEach(()=>{auth.permissions=["hr:employees","hr:employee:read"];vi.mocked(hrApi.employee).mockReset().mockImplementation(async id=>employee(id));vi.mocked(hrApi.employees).mockReset();vi.mocked(hrApi.profile).mockReset();});
it("server route rejects repeated or malformed employee IDs before rendering a client",async()=>{
 expect(parseEmployeeFilter(undefined).valid).toBe(true);expect(parseEmployeeFilter(a)).toEqual({employeeId:a,valid:true});expect(employeeDetailHref(a)).toBe(`/hr/employees?employee_id=${a}`);
 for(const value of ["", "bad", [a], [a,b]])expect(parseEmployeeFilter(value).valid).toBe(false);
 render(await HrEmployeesPage({searchParams:Promise.resolve({employee_id:[a,b]})}));expect(screen.getByRole("heading",{name:"员工定位参数无效"})).toBeInTheDocument();expect(hrApi.employee).not.toHaveBeenCalled();
});
it("direct navigation reads authorized detail without listing and provides directory return",async()=>{
 render(await HrEmployeesPage({searchParams:Promise.resolve({employee_id:a})}));await screen.findByRole("heading",{name:"Synthetic A · 员工详情"});expect(hrApi.employee).toHaveBeenCalledWith(a,"synthetic-token",expect.any(AbortSignal));expect(hrApi.employees).not.toHaveBeenCalled();expect(screen.queryByLabelText("搜索员工")).not.toBeInTheDocument();expect(screen.getByRole("link",{name:"返回员工目录"})).toHaveAttribute("href","/hr/employees");expect(screen.queryByRole("button",{name:"编辑基本信息"})).not.toBeInTheDocument();
});
it("missing page or data read capability makes no detail probe",async()=>{
 auth.permissions=["hr:employee:read"];const view=render(<HrEmployeesClient employeeId={a}/>);await waitFor(()=>expect(hrApi.employee).not.toHaveBeenCalled());view.unmount();auth.permissions=["hr:employees"];render(<HrEmployeesClient employeeId={a}/>);await waitFor(()=>expect(hrApi.employee).not.toHaveBeenCalled());
});
it("team scope denial does not load optional data or expose a target",async()=>{
 auth.permissions=["hr:employees","hr:employee:team_read"];vi.mocked(hrApi.employee).mockRejectedValue(new ApiError("forbidden",403));render(<HrEmployeesClient employeeId={a}/>);await screen.findByText("当前员工详情不在您的数据权限范围内。");expect(hrApi.profile).not.toHaveBeenCalled();expect(screen.queryByText("Synthetic A · 员工详情")).not.toBeInTheDocument();
});
it("foreign response cannot publish the requested employee detail",async()=>{
 vi.mocked(hrApi.employee).mockResolvedValue(employee(b));render(<HrEmployeesClient employeeId={a}/>);await screen.findByText("加载员工详情失败");expect(screen.queryByText("Synthetic B · 员工详情")).not.toBeInTheDocument();
});
it("target changes abort prior reads and suppress late detail",async()=>{
 let resolve:(row:HrEmployee)=>void=()=>{};vi.mocked(hrApi.employee).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));const view=render(<HrEmployeesClient employeeId={a}/>);await waitFor(()=>expect(hrApi.employee).toHaveBeenCalledOnce());const firstSignal=vi.mocked(hrApi.employee).mock.calls[0]?.[2];view.rerender(<HrEmployeesClient employeeId={b}/>);await screen.findByRole("heading",{name:"Synthetic B · 员工详情"});resolve(employee(a));await waitFor(()=>expect(firstSignal?.aborted).toBe(true));expect(screen.queryByRole("heading",{name:"Synthetic A · 员工详情"})).not.toBeInTheDocument();
});
