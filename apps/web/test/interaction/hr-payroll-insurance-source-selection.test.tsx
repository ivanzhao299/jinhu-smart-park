import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {PayrollInsuranceSourceSelection} from "../../app/hr/payroll/PayrollInsuranceSourceSelection";
import {hrApi} from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"synthetic",tenant_id:"tenant",park_id:"park",permissions:["*"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{payrollInsuranceSourceOptions:vi.fn()}}));
const request={legacyBatchId:"legacy",attendanceInputBatchId:"attendance",reconciliationSourceId:"frozen"};
const choice={employeeId:"employee",sourceId:"modern",sourceKind:"modern_confirmed" as const,expectedVersion:2,expectedHash:"a".repeat(64)};
const page={items:[{employeeId:"employee",employeeCode:"SYN-1",fullName:"合成员工",options:[choice]}],total:1,page:1,page_size:50,periodMonth:"2026-07-01"};
beforeEach(()=>{vi.clearAllMocks();state.user={id:"synthetic",tenant_id:"tenant",park_id:"park",permissions:["*"]};vi.mocked(hrApi.payrollInsuranceSourceOptions).mockResolvedValue(page);});
it("loads only after source preparation and never selects a source automatically",async()=>{
 const changed=vi.fn();const view=render(<PayrollInsuranceSourceSelection request={null} disabled={false} onChange={changed}/>);
 expect(hrApi.payrollInsuranceSourceOptions).not.toHaveBeenCalled();
 view.rerender(<PayrollInsuranceSourceSelection request={request} disabled={false} onChange={changed}/>);
 const select=await screen.findByLabelText("合成员工的社保来源");expect(select).toHaveValue("");
 expect(hrApi.payrollInsuranceSourceOptions).toHaveBeenCalledWith(request,"synthetic-token",1,expect.any(AbortSignal));
 fireEvent.change(select,{target:{value:"0"}});expect(changed).toHaveBeenLastCalledWith([choice]);
 fireEvent.click(screen.getByRole("button",{name:"刷新来源并重新选择"}));expect(changed).toHaveBeenLastCalledWith(null);
});
it("requires all employee choices across pages and clears on scope changes",async()=>{
 vi.mocked(hrApi.payrollInsuranceSourceOptions).mockResolvedValueOnce({...page,total:51}).mockResolvedValueOnce({...page,items:[{...page.items[0]!,employeeId:"second",fullName:"另一员工",options:[{...choice,employeeId:"second",sourceId:"second-source"}]}],total:51,page:2});
 const changed=vi.fn();const view=render(<PayrollInsuranceSourceSelection request={request} disabled={false} onChange={changed}/>);
 fireEvent.change(await screen.findByLabelText("合成员工的社保来源"),{target:{value:"0"}});expect(changed).toHaveBeenLastCalledWith(null);
 fireEvent.click(screen.getByRole("button",{name:"下一页"}));await screen.findByLabelText("另一员工的社保来源");
 state.user={...state.user,park_id:"other",permissions:[]};view.rerender(<PayrollInsuranceSourceSelection request={request} disabled={false} onChange={changed}/>);
 await waitFor(()=>expect(screen.queryByLabelText("另一员工的社保来源")).not.toBeInTheDocument());expect(changed).toHaveBeenLastCalledWith(null);
});
it("denied actors make no source requests and missing facts remain visible",async()=>{
 state.user={...state.user,permissions:[]};const changed=vi.fn();const view=render(<PayrollInsuranceSourceSelection request={request} disabled={false} onChange={changed}/>);
 expect(hrApi.payrollInsuranceSourceOptions).not.toHaveBeenCalled();expect(screen.getByText(/需要员工、社保及金额读取权限/)).toBeVisible();
 state.user={...state.user,permissions:["*"]};vi.mocked(hrApi.payrollInsuranceSourceOptions).mockResolvedValue({...page,items:[{...page.items[0]!,options:[]}]});view.rerender(<PayrollInsuranceSourceSelection request={request} disabled={false} onChange={changed}/>);
 expect(await screen.findByText("没有可用社保来源，暂不能核算该员工。")).toBeVisible();expect(changed).toHaveBeenLastCalledWith(null);
});
