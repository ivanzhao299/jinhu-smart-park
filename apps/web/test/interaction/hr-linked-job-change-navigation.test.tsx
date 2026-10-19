import {render,screen} from "@testing-library/react";
import {expect,it,vi} from "vitest";
vi.mock("../../app/hr/lifecycle/HrLifecycleClient",()=>({HrLifecycleClient:({jobChangeId,employeeId}:{jobChangeId?:string;employeeId?:string})=><div data-testid="lifecycle" data-target={jobChangeId} data-employee={employeeId}/> }));
import Page from "../../app/hr/lifecycle/page";
import {parseJobChangeFilter} from "../../app/hr/lifecycle/job-change-navigation";
const id="ABCDEF00-0000-4000-8000-000000000051";
it("passes a normalized exact target from the server and preserves unfiltered browsing",async()=>{
 let view=render(await Page({searchParams:Promise.resolve({job_change_id:id})}));expect(screen.getByTestId("lifecycle")).toHaveAttribute("data-target",id.toLowerCase());view.unmount();
 view=render(await Page({searchParams:Promise.resolve({})}));expect(screen.getByTestId("lifecycle")).not.toHaveAttribute("data-target");view.unmount();
 const employee="abcdef00-0000-4000-8000-000000000052";render(await Page({searchParams:Promise.resolve({employee_id:employee,job_change_id:id})}));expect(screen.getByTestId("lifecycle")).toHaveAttribute("data-employee",employee);expect(screen.getByTestId("lifecycle")).toHaveAttribute("data-target",id.toLowerCase());
});
it("rejects malformed, blank, repeated and mixed valid/invalid parameters before mounting the client",async()=>{
 for(const value of ["", "not-an-id",`${id} `,[id],[id,id],[id,"bad"]]){
  expect(parseJobChangeFilter(value).valid).toBe(false);
  const view=render(await Page({searchParams:Promise.resolve({job_change_id:value})}));expect(screen.getByRole("heading",{name:"岗位变更定位参数无效"})).toBeVisible();expect(screen.queryByTestId("lifecycle")).toBeNull();view.unmount();
 }
});
