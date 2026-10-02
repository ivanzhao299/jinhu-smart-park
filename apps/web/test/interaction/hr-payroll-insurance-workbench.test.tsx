import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {HrPayrollClient} from "../../app/hr/payroll/HrPayrollClient";
import {hrApi} from "../../lib/hr-api";
const state=vi.hoisted(()=>({user:{id:"synthetic",tenant_id:"tenant",park_id:"park",enabled_modules:[{module_code:"hr",enabled:true}],permissions:["hr:payroll","hr:payroll_reconciliation:calculate","hr:employee:read","hr:insurance:read","hr:insurance_amount:read"]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{payrollReconciliations:vi.fn(),payrollReconciliation:vi.fn(),payrollReconciliationSetup:vi.fn(),payrollInsuranceSourceOptions:vi.fn(),simulatePayrollReconciliation:vi.fn()}}));
const choice={employeeId:"employee",sourceId:"revision",sourceKind:"modern_confirmed" as const,expectedVersion:2,expectedHash:"a".repeat(64)};
const setup={books:[],netItems:[],legacyBatches:[],sourceBatches:[],attendanceBatches:[{id:"attendance",periodMonth:"2026-07-01",batchNo:1}],frozenSources:[{id:"source",legacyBatchId:"legacy",bookName:"合成账套",periodMonth:"2026-07-01",snapshotCount:1}]};
beforeEach(()=>{vi.clearAllMocks();state.user={...state.user,park_id:"park"};vi.mocked(hrApi.payrollReconciliations).mockResolvedValue({items:[],total:0,page:1,page_size:20});vi.mocked(hrApi.payrollReconciliationSetup).mockResolvedValue(setup as never);vi.mocked(hrApi.payrollInsuranceSourceOptions).mockResolvedValue({items:[{employeeId:"employee",employeeCode:"SYN-1",fullName:"合成员工",options:[choice]}],total:1,page:1,page_size:50,periodMonth:"2026-07-01"});});
async function choose(){
 await screen.findByRole("option",{name:/已冻结/});
 fireEvent.change(screen.getByLabelText("历史工资核对来源"),{target:{value:"source:source"}});
 fireEvent.change(screen.getByLabelText("已关闭且生效的考勤输入"),{target:{value:"attendance"}});
 fireEvent.change(await screen.findByLabelText("合成员工的社保来源"),{target:{value:"0"}});
}
it("full workbench sends observed insurance choices and preserves key/body on retry",async()=>{
 vi.mocked(hrApi.simulatePayrollReconciliation).mockRejectedValueOnce(new Error("synthetic retry")).mockResolvedValueOnce({id:"run"} as never);
 render(<HrPayrollClient/>);await choose();
 fireEvent.click(screen.getByRole("button",{name:"开始只算不发"}));await screen.findByText("synthetic retry");
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始只算不发"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始只算不发"}));
 await screen.findByText("模拟完成，未触发发薪。");const calls=vi.mocked(hrApi.simulatePayrollReconciliation).mock.calls;
 expect(calls).toHaveLength(2);expect(calls[0]![0]).toEqual({legacyBatchId:"legacy",attendanceInputBatchId:"attendance",reconciliationSourceId:"source",insuranceSources:[choice]});expect(calls[0]![2]).toBe(calls[1]![2]);expect(calls[0]![0]).toEqual(calls[1]![0]);
 expect(screen.getByRole("button",{name:"开始只算不发"})).toBeDisabled();
});
it("scope change aborts pending simulation and suppresses its stale completion",async()=>{
 let resolve!:(value:never)=>void;vi.mocked(hrApi.simulatePayrollReconciliation).mockReturnValue(new Promise(done=>{resolve=done;}));
 const view=render(<HrPayrollClient/>);await choose();fireEvent.click(screen.getByRole("button",{name:"开始只算不发"}));await waitFor(()=>expect(hrApi.simulatePayrollReconciliation).toHaveBeenCalledOnce());
 const signal=vi.mocked(hrApi.simulatePayrollReconciliation).mock.calls[0]![3]!;
 state.user={...state.user,park_id:"other"};view.rerender(<HrPayrollClient/>);await waitFor(()=>expect(signal.aborted).toBe(true));resolve({id:"old-run"} as never);
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始只算不发"})).toBeDisabled());expect(screen.queryByText("模拟完成，未触发发薪。")).not.toBeInTheDocument();
});

it("difference detail displays the run frozen source and marks absent old evidence",async()=>{
 vi.mocked(hrApi.payrollReconciliations).mockResolvedValue({items:[{id:"run",employeeCount:2,differenceCount:1,createdAt:"2026-07-01T00:00:00Z"}],total:1,page:1,page_size:20} as never);
 vi.mocked(hrApi.payrollReconciliation).mockResolvedValue({id:"run",employeeCount:2,results:[{resultId:"result-1",employeeCode:"SYN-1",employeeName:"合成员工",oldTotal:"1.00",newTotal:"2.00",deltaTotal:"1.00",differences:[],insuranceSource:{sourceKind:"modern_confirmed",sourceId:"old-revision",version:"1",snapshotHash:"b".repeat(64)}},{resultId:"result-2",employeeCode:"SYN-2",employeeName:"合成旧记录",oldTotal:"1.00",newTotal:"1.00",deltaTotal:"0.00",differences:[],insuranceSource:null}]} as never);
 render(<HrPayrollClient/>);fireEvent.click(await screen.findByRole("button",{name:"查看差异"}));
 await screen.findByText("社保输入：现代确认 · 冻结版本 1");expect(screen.getByText("社保输入：未保留可展示的冻结来源")).toBeInTheDocument();
 expect(screen.queryByText("b".repeat(64))).not.toBeInTheDocument();
});
