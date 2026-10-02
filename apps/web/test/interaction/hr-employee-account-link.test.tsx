import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { describe,it,expect,vi } from "vitest";
import { EmployeeAccountLink } from "../../app/hr/employees/EmployeeAccountLink";
import { hrApi,type HrEmployee } from "../../lib/hr-api";
vi.mock("../../lib/hr-api",()=>({hrApi:{linkEmployeeAccount:vi.fn()}}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-test-token"}));
const employee={id:"employee",fullName:"Test Employee",employeeCode:"E1",userId:null,employmentStatus:"active"} as HrEmployee;
const users=[{id:"account",username:"verified.account",displayName:"Test Account",status:"enabled"}];
describe("employee account association",()=>{
 it("requires selection reason and human confirmation then sends only association fields",async()=>{
  const saved=vi.fn();vi.mocked(hrApi.linkEmployeeAccount).mockResolvedValue({...employee,userId:"account"});
  render(<EmployeeAccountLink employee={employee} users={users} onSaved={saved}/>);
  const button=screen.getByRole("button",{name:"确认保存账号关联"});expect(button).toBeDisabled();
  fireEvent.change(screen.getByRole("combobox"),{target:{value:"account"}});
  expect(screen.getByLabelText("核对与变更原因")).toBeRequired();expect(screen.getByRole("checkbox")).toBeRequired();
  fireEvent.change(screen.getByLabelText("核对与变更原因"),{target:{value:"verified identity"}});fireEvent.click(screen.getByRole("checkbox"));fireEvent.submit(button.closest("form")!);
  await waitFor(()=>expect(saved).toHaveBeenCalledWith({...employee,userId:"account"}));
  expect(hrApi.linkEmployeeAccount).toHaveBeenCalledWith("employee",{userId:"account",expectedUserId:null,reason:"verified identity"},"synthetic-test-token");
 });
 it("keeps other accounts unavailable for departed employees",()=>{
  render(<EmployeeAccountLink employee={{...employee,employmentStatus:"departed",userId:"old-account"}} users={users} onSaved={vi.fn()}/>);
  expect(screen.queryByRole("option",{name:/verified.account/})).toBeNull();expect(screen.getByRole("option",{name:"不关联账号"})).toBeInTheDocument();
 });
});
