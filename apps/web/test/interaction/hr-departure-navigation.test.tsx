import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { beforeEach,describe,it,expect,vi } from "vitest";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DepartureApplicationsPanel } from "../../app/hr/lifecycle/DepartureApplicationsPanel";
import { departureWorkflowHref,parseDepartureEmployeeFilter } from "../../app/hr/lifecycle/departure-navigation";
import { EmployeeDepartureLink } from "../../app/hr/employees/EmployeeDepartureLink";
import type { HrEmployee } from "../../lib/hr-api";
import { hrApi } from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"actor",permissions:["hr:departure:read"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{departureApplications:vi.fn(),departureOptions:vi.fn()}}));
const employeeId="00000000-0000-4000-8000-000000000011";
const row=(page:number)=>({id:`row-${page}`,employeeId,employeeName:`Test employee page ${page}`,status:"draft",applicationNo:`APP-${page}`,applicationDate:"2026-10-01",plannedDepartureDate:"2026-10-03"});
beforeEach(()=>{vi.clearAllMocks();state.user={id:"actor",permissions:[HR_PERMISSIONS.HR_DEPARTURE_READ]};vi.mocked(hrApi.departureApplications).mockImplementation(async(_token,page=1)=>({items:[row(page)],page,page_size:50,total:113}) as Awaited<ReturnType<typeof hrApi.departureApplications>>)});
describe("departure navigation",()=>{
 it("preserves exact identity and rejects invalid or repeated query parameters",()=>{expect(departureWorkflowHref(employeeId)).toBe(`/hr/lifecycle?employee_id=${employeeId}#departure-clearance`);expect(parseDepartureEmployeeFilter(employeeId)).toEqual({employeeId,valid:true});for(const invalid of ["E-1","",[employeeId]])expect(parseDepartureEmployeeFilter(invalid).valid).toBe(false);expect(parseDepartureEmployeeFilter(undefined).valid).toBe(true)});
 it("actual employee detail entry carries the exact identity and target anchor",()=>{render(<EmployeeDepartureLink employee={{id:employeeId,fullName:"Test",employeeCode:"E1"} as HrEmployee}/>);expect(screen.getByRole("link",{name:"进入该员工离职流程"})).toHaveAttribute("href",departureWorkflowHref(employeeId))});
 it("retains exact employee filter while paging beyond the first 50",async()=>{
  render(<DepartureApplicationsPanel employeeId={employeeId}/>);await screen.findByText(/Test employee page 1/);
  fireEvent.click(screen.getByRole("button",{name:"下一页"}));await screen.findByText(/Test employee page 2/);expect(screen.queryByText(/Test employee page 1/)).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"下一页"}));await screen.findByText(/Test employee page 3/);expect(screen.getByRole("button",{name:"下一页"})).toBeDisabled();
  expect(hrApi.departureApplications).toHaveBeenLastCalledWith("synthetic-token",3,50,undefined,expect.any(AbortSignal),employeeId);
 });
 it("clears previous employee rows when exact identity changes",async()=>{
  const view=render(<DepartureApplicationsPanel employeeId={employeeId}/>);await screen.findByText(/Test employee page 1/);
  vi.mocked(hrApi.departureApplications).mockImplementation(()=>new Promise(()=>{}));view.rerender(<DepartureApplicationsPanel employeeId="00000000-0000-4000-8000-000000000012"/>);
  expect(screen.queryByText(/Test employee page 1/)).toBeNull();await waitFor(()=>expect(hrApi.departureApplications).toHaveBeenCalledTimes(2));
 });
 it("without departure read access does not fetch or expose the panel",()=>{state.user={id:"actor",permissions:[]};render(<DepartureApplicationsPanel employeeId={employeeId}/>);expect(hrApi.departureApplications).not.toHaveBeenCalled();expect(screen.queryByText("离职申请与清场")).toBeNull()});
});
