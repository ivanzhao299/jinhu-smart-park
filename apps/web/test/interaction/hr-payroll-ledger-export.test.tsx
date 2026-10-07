import {act,fireEvent,render,screen} from "@testing-library/react";
import {beforeEach,it,expect,vi} from "vitest";
import {PayrollLedgerExport} from "../../app/hr/payroll/PayrollLedgerExport";
import type * as ExportModule from "../../app/hr/payroll/payroll-ledger-export";
import {downloadPayrollLedger} from "../../app/hr/payroll/payroll-ledger-export";
import {hrApi,type HrPayrollHistoryRow} from "../../lib/hr-api";

const state=vi.hoisted(()=>({user:{id:"actor",permissions:["hr:payroll_history:read"],enabled_modules:[{module_code:"hr"}]}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../lib/authz",()=>({getAccessToken:()=>"synthetic-token"}));
vi.mock("../../lib/hr-api",()=>({hrApi:{payrollHistory:vi.fn()}}));
vi.mock("../../app/hr/payroll/payroll-ledger-export",async importOriginal=>({...await importOriginal<typeof ExportModule>(),downloadPayrollLedger:vi.fn()}));
const rows:HrPayrollHistoryRow[]=[{id:"synthetic-payroll",periodMonth:"2026-07-01",legacyScheme:"1",bookName:"合成账套",employeeName:"合成员工",employeeCode:"SYN-1",grossAmount:"5100.0000",deductionAmount:"100.0000",taxAmount:null,netAmount:"5000.0000",publicationStatus:"published"}];
const page={items:rows,total:1,page:1,page_size:100};
const filters={periodFrom:"2026-07",periodTo:"2026-07"};
beforeEach(()=>{vi.clearAllMocks();state.user={id:"actor",permissions:["hr:payroll_history:read"],enabled_modules:[{module_code:"hr"}]};vi.mocked(hrApi.payrollHistory).mockResolvedValue(page);});
it("uses applied month filters and signal, coalesces clicks, then downloads complete rows",async()=>{
  render(<PayrollLedgerExport filters={filters}/>);const button=screen.getByRole("button",{name:"导出筛选工资"});fireEvent.click(button);fireEvent.click(button);
  await screen.findByText("已导出 1 条匹配工资记录。");expect(hrApi.payrollHistory).toHaveBeenCalledTimes(2);expect(downloadPayrollLedger).toHaveBeenCalledTimes(1);
  for(const call of vi.mocked(hrApi.payrollHistory).mock.calls){expect(call.slice(0,4)).toEqual(["synthetic-token",1,100,filters]);expect(call[4]).toBeInstanceOf(AbortSignal);}
});
it("requires applied date bounds for management and does not make premature requests",()=>{
  render(<PayrollLedgerExport filters={{}}/>);fireEvent.click(screen.getByRole("button",{name:"导出筛选工资"}));expect(screen.getByRole("status").textContent).toContain("请先查询");expect(hrApi.payrollHistory).not.toHaveBeenCalled();
});
it("self export omits employee identity and management visibility",async()=>{
  state.user.permissions=["hr:payroll_history:self_read"];render(<PayrollLedgerExport filters={{}}/>);fireEvent.click(screen.getByRole("button",{name:"导出筛选工资"}));await screen.findByText("已导出 1 条匹配工资记录。");
  const csv=vi.mocked(downloadPayrollLedger).mock.calls[0]![0];expect(csv).toContain("5000.0000");expect(csv).not.toContain("合成员工");expect(csv).not.toContain("SYN-1");expect(csv).not.toContain("员工可见");
});
it("scope/filter changes abort the request and prevent late sensitive downloads",async()=>{
  let resolve:(value:typeof page)=>void=()=>{};vi.mocked(hrApi.payrollHistory).mockImplementation(()=>new Promise(done=>{resolve=done}));
  const {rerender}=render(<PayrollLedgerExport filters={filters}/>);fireEvent.click(screen.getByRole("button",{name:"导出筛选工资"}));const signal=vi.mocked(hrApi.payrollHistory).mock.calls[0]![4];
  rerender(<PayrollLedgerExport filters={{periodFrom:"2026-08",periodTo:"2026-08"}}/>);expect(signal?.aborted).toBe(true);await act(async()=>resolve(page));expect(downloadPayrollLedger).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"导出筛选工资"}));const nextSignal=vi.mocked(hrApi.payrollHistory).mock.calls[1]![4];state.user={...state.user,id:"another-scope"};rerender(<PayrollLedgerExport filters={{periodFrom:"2026-08",periodTo:"2026-08"}}/>);expect(nextSignal?.aborted).toBe(true);await act(async()=>resolve(page));expect(downloadPayrollLedger).not.toHaveBeenCalled();
});
it("team summary and disabled-module users cannot export wage amounts",()=>{
  state.user.permissions=["hr:payroll_history:team_summary"];const {rerender}=render(<PayrollLedgerExport filters={filters}/>);expect(screen.queryByRole("button")).toBeNull();
  state.user.permissions=["hr:payroll_history:read"];state.user.enabled_modules=[];rerender(<PayrollLedgerExport filters={filters}/>);expect(screen.queryByRole("button")).toBeNull();expect(hrApi.payrollHistory).not.toHaveBeenCalled();
});
it("unmount and failed reads never download partial results",async()=>{
  vi.mocked(hrApi.payrollHistory).mockRejectedValue(new Error("范围拒绝"));const {unmount}=render(<PayrollLedgerExport filters={filters}/>);fireEvent.click(screen.getByRole("button",{name:"导出筛选工资"}));await screen.findByText("范围拒绝");expect(downloadPayrollLedger).not.toHaveBeenCalled();unmount();
  let resolve:(value:typeof page)=>void=()=>{};vi.mocked(hrApi.payrollHistory).mockImplementation(()=>new Promise(done=>{resolve=done}));const pending=render(<PayrollLedgerExport filters={filters}/>);fireEvent.click(screen.getByRole("button",{name:"导出筛选工资"}));const signal=vi.mocked(hrApi.payrollHistory).mock.calls.at(-1)![4];pending.unmount();expect(signal?.aborted).toBe(true);await act(async()=>resolve(page));expect(downloadPayrollLedger).not.toHaveBeenCalled();
});
