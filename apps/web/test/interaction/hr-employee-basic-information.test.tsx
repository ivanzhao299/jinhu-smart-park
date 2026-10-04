import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrEmployeeBasicMaintenance } from "../../app/hr/employees/components/HrEmployeeBasicMaintenance";
import { HrEmployeesClient } from "../../app/hr/employees/HrEmployeesClient";
import { ApiError } from "../../lib/api-client";
import { hrApi, type HrEmployeeBasicInformation } from "../../lib/hr-api";

vi.mock("../../lib/hr-api",()=>({hrApi:{employeeBasicInformation:vi.fn(),updateEmployeeBasicInformation:vi.fn(),employees:vi.fn(),employee:vi.fn(),directoryOptions:vi.fn()}}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-test-token"}));
const auth=vi.hoisted(()=>({permissions:["hr:employees","hr:employee:read"]}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>({id:"synthetic-user",permissions:auth.permissions})}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
const record:HrEmployeeBasicInformation={id:"synthetic-employee",version:4,fullName:"Synthetic employee",employmentType:"full_time",hireDate:"2020-01-01",workLocation:"Original work",workMobile:"synthetic-phone",workEmail:"synthetic@example.invalid",remark:"Original remark"};
beforeEach(()=>{
 vi.mocked(hrApi.employeeBasicInformation).mockReset().mockResolvedValue({...record});
 vi.mocked(hrApi.updateEmployeeBasicInformation).mockReset().mockImplementation(async(_id,body)=>({...record,...body,version:5}));
 auth.permissions=["hr:employees","hr:employee:read"];
});
async function open(captureScope=()=>()=>true,onSaved=vi.fn()){
 render(<HrEmployeeBasicMaintenance employeeId={record.id} captureScope={captureScope} onSaved={onSaved}/>);
 fireEvent.click(screen.getByRole("button",{name:"编辑基本信息"}));await screen.findByRole("form",{name:"编辑员工基本信息"});return onSaved;
}
function submit(){fireEvent.submit(screen.getByRole("form",{name:"编辑员工基本信息"}));}
it("submits only changed ordinary fields with the read version and explicit clearing",async()=>{
 const saved=await open();fireEvent.change(screen.getByLabelText("姓名"),{target:{value:"Revised employee"}});fireEvent.change(screen.getByLabelText("工作邮箱"),{target:{value:""}});submit();
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce());expect(hrApi.updateEmployeeBasicInformation).toHaveBeenCalledWith(record.id,{expectedVersion:4,fullName:"Revised employee",workEmail:null},"synthetic-test-token");expect(screen.getByRole("status")).toHaveTextContent("已保存");
});
it("an unchanged form does not write",async()=>{await open();submit();expect(hrApi.updateEmployeeBasicInformation).not.toHaveBeenCalled();expect(screen.getByRole("status")).toHaveTextContent("没有需要保存");});
it("a stale update preserves the draft and requires an explicit reload",async()=>{
 await open();vi.mocked(hrApi.updateEmployeeBasicInformation).mockRejectedValueOnce(new ApiError("conflict",409));fireEvent.change(screen.getByLabelText("姓名"),{target:{value:"Draft retained"}});submit();
 await screen.findByRole("alert");expect(screen.getByLabelText("姓名")).toHaveValue("Draft retained");expect(screen.getByRole("button",{name:"保存基本信息"})).toBeDisabled();
 vi.mocked(hrApi.employeeBasicInformation).mockResolvedValueOnce({...record,version:6,fullName:"Concurrent update"});fireEvent.click(screen.getByRole("button",{name:"重新加载基本信息"}));await waitFor(()=>expect(screen.getByLabelText("姓名")).toHaveValue("Concurrent update"));expect(screen.getByRole("button",{name:"保存基本信息"})).toBeEnabled();
});
it("a failed or mismatched read never publishes writable fields",async()=>{
 vi.mocked(hrApi.employeeBasicInformation).mockResolvedValueOnce({...record,id:"foreign-employee"});render(<HrEmployeeBasicMaintenance employeeId={record.id} captureScope={()=>()=>true} onSaved={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"编辑基本信息"}));await screen.findByRole("alert");expect(screen.queryByRole("form")).not.toBeInTheDocument();expect(hrApi.updateEmployeeBasicInformation).not.toHaveBeenCalled();
});
it("scope invalidation suppresses late successful mutation responses",async()=>{
 let current=true;const saved=await open(()=>()=>current);let resolve:(value:HrEmployeeBasicInformation)=>void=()=>{};vi.mocked(hrApi.updateEmployeeBasicInformation).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));fireEvent.change(screen.getByLabelText("姓名"),{target:{value:"Outdated draft"}});submit();current=false;resolve({...record,version:5});await waitFor(()=>expect(hrApi.updateEmployeeBasicInformation).toHaveBeenCalledOnce());expect(saved).not.toHaveBeenCalled();
});
it("the actual employee page hides basic editing without manage permission",async()=>{
 const employee={...record,employeeCode:"SYN-BASIC",userId:null,primaryOrgId:null,positionId:null,managerEmployeeId:null,employmentStatus:"active",legacyJobstateCode:null,legacyJobstateName:null,departureDate:null};
 vi.mocked(hrApi.employees).mockResolvedValue({items:[employee],total:1,page:1,page_size:50});vi.mocked(hrApi.employee).mockResolvedValue(employee);
 render(<HrEmployeesClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看档案"}));await screen.findByRole("heading",{name:"Synthetic employee · 员工详情"});expect(screen.queryByRole("button",{name:"编辑基本信息"})).not.toBeInTheDocument();expect(hrApi.employeeBasicInformation).not.toHaveBeenCalled();
});
