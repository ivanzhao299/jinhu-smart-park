import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrInsuranceClient } from "../../app/hr/insurance/HrInsuranceClient";
import Page from "../../app/hr/insurance/page";
import { hrApi } from "../../lib/hr-api";
const id="11111111-1111-4111-8111-111111111111", other="22222222-2222-4222-8222-222222222222";
const state=vi.hoisted(()=>({user:{id:"synthetic-hr",permissions:["*"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../components/auth/PermissionGuard",()=>({PermissionGuard:({children}:{children:React.ReactNode})=>children}));
vi.mock("../../lib/hr-api",()=>({hrApi:{insurancePeriods:vi.fn(),insurancePeriod:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();state.user={id:"synthetic-hr",permissions:["*"]};vi.mocked(hrApi.insurancePeriods).mockImplementation(async(_token,page=1,size=30,filter)=>({page,page_size:size,total:31,items:[{id:`period-${filter?.employeeId}-${page}`,employeeName:filter?.employeeId===other?"另一员工":"指定员工",periodYear:2026,periodMonth:7,needsReview:false,reviewReasonCode:null,itemCount:1,employeeAmount:"1.00",supplementAmount:"0.00"}]}));});
it("keeps exact employee during paging, month filtering and refresh, with explicit navigation",async()=>{
 render(<HrInsuranceClient employeeId={id}/>);
 await screen.findByText("指定员工 · 2026 年 7 月");expect(screen.queryByPlaceholderText("姓名或员工编号")).toBeNull();
 expect(screen.getByRole("link",{name:"返回员工档案"})).toHaveAttribute("href",`/hr/employees?employee_id=${id}`);
 expect(screen.getByRole("link",{name:"查看完整权限范围台账"})).toHaveAttribute("href","/hr/insurance");
 fireEvent.click(screen.getByRole("button",{name:"下一页"}));await waitFor(()=>expect(vi.mocked(hrApi.insurancePeriods).mock.lastCall?.[1]).toBe(2));
 fireEvent.change(screen.getByLabelText("月份"),{target:{value:"8"}});await waitFor(()=>expect(vi.mocked(hrApi.insurancePeriods).mock.lastCall?.[3]?.month).toBe(8));
 fireEvent.click(screen.getByRole("button",{name:"刷新本页"}));await waitFor(()=>expect(hrApi.insurancePeriods).toHaveBeenCalledTimes(4));
 for(const call of vi.mocked(hrApi.insurancePeriods).mock.calls)expect(call[3]?.employeeId).toBe(id);
});
it("switching employee discards a late old employee response",async()=>{
 let finish:(value:Awaited<ReturnType<typeof hrApi.insurancePeriods>>)=>void=()=>{};
 vi.mocked(hrApi.insurancePeriods).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=render(<HrInsuranceClient employeeId={id}/>);await waitFor(()=>expect(hrApi.insurancePeriods).toHaveBeenCalledTimes(1));
 view.rerender(<HrInsuranceClient employeeId={other}/>);await screen.findByText("另一员工 · 2026 年 7 月");
 finish({page:1,page_size:30,total:1,items:[{id:"old",employeeName:"过期员工",periodYear:2026,periodMonth:7,needsReview:false,reviewReasonCode:null,itemCount:1}]});
 await waitFor(()=>expect(screen.queryByText(/过期员工/)).toBeNull());expect(screen.getByText("另一员工 · 2026 年 7 月")).toBeVisible();
});
it("self scope still uses own route and permission revocation immediately hides data",async()=>{
 state.user={id:"synthetic-self",permissions:["hr:insurance:self_read"]};const view=render(<HrInsuranceClient employeeId={id}/>);
 await screen.findByText("指定员工 · 2026 年 7 月");expect(vi.mocked(hrApi.insurancePeriods).mock.lastCall?.[4]).toBe(true);
 state.user={id:"synthetic-self",permissions:[]};view.rerender(<HrInsuranceClient employeeId={id}/>);expect(screen.queryByText(/指定员工/)).toBeNull();expect(screen.getByText("403，无权访问五险一金")).toBeVisible();
});
it.each(["invalid",[id,id],""])("invalid navigation never mounts broad insurance query: %s",async value=>{
 render(await Page({searchParams:Promise.resolve({employee_id:value})}));expect(screen.getByText("员工定位参数无效")).toBeVisible();expect(hrApi.insurancePeriods).not.toHaveBeenCalled();
});
